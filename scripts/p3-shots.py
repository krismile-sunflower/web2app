"""P3 验证：分享码 / 场景模板导入导出 / 备份分享码 / 深色模式。

跑法（system Python 3.11 里有 playwright 1.49.1，chromium-1148 是配套浏览器）：
  C:/Users/89221/AppData/Local/Programs/Python/Python311/python.exe scripts/p3-shots.py
前置：先 `npm run build`，再 `npx vite preview --port 4173`。
"""
import base64
import json
import os
import sys

from playwright.sync_api import sync_playwright

CHROME = os.environ.get(
    "P3_CHROME",
    os.path.expanduser(r"~\AppData\Local\ms-playwright\chromium-1148\chrome-win\chrome.exe"),
)
URL = os.environ.get("P3_URL", "http://127.0.0.1:4180/")
SHOTS = os.environ.get(
    "P3_SHOTS",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                 ".workbuddy-ai", "tmp", "p3"),
)
os.makedirs(SHOTS, exist_ok=True)

PREFIX = "W2A1."


def code(payload: dict) -> str:
    raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    return PREFIX + base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode(text: str) -> dict:
    body = text.strip()[len(PREFIX):]
    pad = "=" * ((4 - len(body) % 4) % 4)
    return json.loads(base64.urlsafe_b64decode(body + pad).decode("utf-8"))


SITES = [
    {"id": "s1", "url": "https://news.example.com/", "name": "资讯", "group": "工作",
     "pinned": False, "ua": "default", "createdAt": 1},
    {"id": "s2", "url": "https://mail.example.com/", "name": "邮箱", "group": "工作",
     "pinned": False, "ua": "default", "createdAt": 2},
    {"id": "s3", "url": "https://quote.example.com/", "name": "行情", "group": "看盘",
     "pinned": False, "ua": "default", "createdAt": 3},
]
SCENES = {"scenes": [{"id": "sc1", "name": "上班", "order": 0, "groups": ["工作"],
                      "includeIds": [], "excludeIds": [], "overrides": {"ua": "desktop"}}],
          "activeSceneId": None}

SEED = """
const sites = %s;
const scenes = %s;
localStorage.setItem('CapacitorStorage.web2app.sites.v1', JSON.stringify(sites));
localStorage.setItem('CapacitorStorage.web2app.scenes.v1', JSON.stringify(scenes));
""" % (json.dumps(SITES, ensure_ascii=False), json.dumps(SCENES, ensure_ascii=False))

ok = []
fail = []


def check(name, cond, extra=""):
    (ok if cond else fail).append(name)
    print(("  PASS " if cond else "  FAIL ") + name + (f"  <- {extra}" if extra and not cond else ""))


def shot(page, name):
    page.screenshot(path=os.path.join(SHOTS, name + ".png"))


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME)
        ctx = browser.new_context(viewport={"width": 420, "height": 880},
                                  device_scale_factor=2, locale="zh-CN")
        page = ctx.new_page()
        page.add_init_script(SEED)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL, wait_until="networkidle")
        page.wait_for_selector(".card", timeout=8000)

        print("\n[1] 场景模板：导出分享码（含站点）")
        page.get_by_label("设置").click()
        dlg = page.get_by_role("dialog", name="设置")
        dlg.wait_for()
        dlg.get_by_text("管理场景", exact=True).click()
        scene_dlg = page.get_by_role("dialog", name="场景")
        scene_dlg.wait_for()
        scene_dlg.get_by_text("上班", exact=True).click()
        page.wait_for_selector("text=分享模板")
        page.get_by_label("连站点一起打包").click()
        page.get_by_text("生成分享码", exact=True).click()
        ta = page.locator(".srow-detail textarea").first
        ta.wait_for()
        exported = ta.input_value()
        check("分享码以 W2A1. 开头", exported.startswith(PREFIX), exported[:24])
        shot(page, "p3-01-scene-share-code")

        tpl = decode(exported)
        check("载荷是场景模板", tpl.get("kind") == "scene", str(tpl)[:120])
        sc = tpl.get("scene", {})
        check("模板名 = 上班", sc.get("name") == "上班", str(sc.get("name")))
        check("模板分组 = [工作]", sc.get("groups") == ["工作"], str(sc.get("groups")))
        check("模板带场景覆盖 ua=desktop", (sc.get("overrides") or {}).get("ua") == "desktop",
              str(sc.get("overrides")))
        check("模板打包了 2 个站点", len(sc.get("sites") or []) == 2,
              str([s.get("name") for s in sc.get("sites") or []]))
        check("模板站点不带 id", all("id" not in s for s in sc.get("sites") or []))

        print("\n[2] 场景模板：导入预览 + 同名改名")
        page.get_by_text("返回列表", exact=True).click()
        page.get_by_text("导入场景模板", exact=True).click()
        page.locator("textarea.form-textarea").fill(exported)
        page.wait_for_selector("text=本机已有同名场景")
        body = page.locator(".sheet-body").inner_text()
        check("提示同名会自动改名", "上班 2" in body, body[:200])
        check("预览显示将导入的场景名", "上班" in body)
        check("预览说明不涉及具体站点（按分组生效）", "不涉及具体站点" in body, body[:300])
        shot(page, "p3-02-import-preview")
        page.get_by_role("button", name="导入", exact=True).click()
        page.wait_for_selector("text=已导入场景")
        msg = page.locator(".settings-msg").first.inner_text()
        check("导入结果提到改名", "上班 2" in msg, msg)
        rows = page.locator(".settings-card .srow .srow-label").all_inner_texts()
        check("场景列表里出现「上班 2」", "上班 2" in rows, str(rows))

        print("\n[3] 场景模板：引用不到的站点")
        ghost = code({"kind": "scene", "version": 1, "scene": {
            "name": "外部场景", "groups": [], "includeUrls": ["https://ghost.example.com/"],
            "excludeUrls": []}})
        page.get_by_text("导入场景模板", exact=True).click()
        page.locator("textarea.form-textarea").fill(ghost)
        page.wait_for_selector("text=引用不到")
        body = page.locator(".sheet-body").inner_text()
        check("提示引用不到 1 个站点", "引用不到 1 个站点" in body, body[:300])
        check("列出缺失网址", "ghost.example.com" in body)
        shot(page, "p3-03-missing-refs")
        page.get_by_text("返回列表", exact=True).click()
        page.get_by_role("dialog", name="场景").get_by_label("关闭").click()

        print("\n[4] 设置 → 数据：导出分享码 / JSON 切换")
        page.get_by_label("设置").click()
        dlg = page.get_by_role("dialog", name="设置")
        dlg.wait_for()
        dlg.get_by_text("导出数据", exact=True).click()
        ta = page.locator(".srow-detail textarea").first
        ta.wait_for()
        backup_code = ta.input_value()
        check("默认导出分享码", backup_code.startswith(PREFIX), backup_code[:24])
        payload = decode(backup_code)
        check("载荷 kind=backup", payload.get("kind") == "backup", str(payload)[:80])
        check("备份含 3 个网页", len(payload.get("sites") or []) == 3)
        check("备份含 2 个场景", len(payload.get("scenes") or []) == 2,
              str(len(payload.get("scenes") or [])))
        check("备份含设置", bool(payload.get("settings")))
        shot(page, "p3-04-settings-export-code")

        page.locator('[aria-label="导出格式"] .segment', has_text="JSON").click()
        as_json = page.locator(".srow-detail textarea").first.input_value()
        check("切到 JSON 后是信封对象", as_json.strip().startswith("{") and '"version": 2' in as_json,
              as_json[:60])
        check("JSON 里没有 W2A1 前缀", PREFIX not in as_json)
        shot(page, "p3-05-settings-export-json")

        print("\n[5] 设置 → 数据：导入（场景模板提示 / 备份恢复）")
        dlg.get_by_text("导入数据", exact=True).click()
        imp = page.locator(".srow-detail textarea").nth(1)
        imp.fill(ghost)
        page.wait_for_selector("text=这是一份「场景模板」")
        body = page.locator(".sheet-body").inner_text()
        check("粘贴场景模板时给出正确指引", "场景模板" in body and "去场景管理" in body, body[:300])
        shot(page, "p3-06-settings-import-scene-hint")

        # 换一份「站点被换掉」的备份，确认覆盖提示与写入都生效
        new_sites = [{"id": "n1", "url": "https://a.example.com/", "name": "A 站", "group": "",
                      "pinned": False, "ua": "default", "createdAt": 9}]
        fresh = code({"kind": "backup", "version": 2, "sites": new_sites, "scenes": []})
        imp.fill(fresh)
        page.wait_for_selector("text=将覆盖为")
        body = page.locator(".sheet-body").inner_text()
        check("备份预览显示条数", "将覆盖为 1 个网页" in body, body[:200])
        page.get_by_role("button", name="导入并覆盖").click()
        page.wait_for_selector("text=已导入 1 个网页")
        msg = page.locator(".settings-msg").first.inner_text()
        check("导入结果提示条数", "1 个网页" in msg, msg)
        stored = page.evaluate("JSON.parse(localStorage['CapacitorStorage.web2app.sites.v1'])")
        check("数据确实被覆盖为 1 条", len(stored) == 1 and stored[0]["name"] == "A 站", str(stored))
        shot(page, "p3-07-settings-import-backup")

        print("\n[6] 深色模式")
        page.locator('[aria-label="应用主题"] .segment', has_text="深色").click()
        page.wait_for_timeout(220)
        theme = page.evaluate("document.documentElement.dataset.theme")
        check("应用切到深色", theme == "dark", str(theme))
        dlg.get_by_text("导出数据", exact=True).click()
        page.wait_for_timeout(200)
        shot(page, "p3-08-settings-dark")

        print("\n[7] 无 JS 运行时报错")
        check("没有 pageerror", not errors, "; ".join(errors[:3]))

        browser.close()

    print("\n==== 结果 ====")
    print(f"通过 {len(ok)} / {len(ok) + len(fail)}")
    for f in fail:
        print("  未通过：" + f)
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main())
