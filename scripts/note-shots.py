"""验证「纯文本条目」：首页独立分区、搜索、复制、增删改、备份往返、场景共存。

跑法（system Python 3.11 里有 playwright 1.49.1）：
  C:/Users/89221/AppData/Local/Programs/Python/Python311/python.exe scripts/note-shots.py
前置：先 `npm run build`，再在同一条命令里起本地静态服务（沙箱不保留跨调用进程）。
"""
import base64
import json
import os
import sys
import time

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
NOW = int(time.time() * 1000)

SITES = [
    {"id": "s1", "url": "https://news.example.com/", "name": "资讯", "group": "工作",
     "pinned": False, "ua": "default", "createdAt": 1},
]
NOTES = [
    {"id": "n1", "body": "会议室 A 的密码是 1234\n进门先按 # 再输密码", "createdAt": NOW - 3600_000},
    {"id": "n2", "body": "ssh -i ~/.ssh/id_ed25519 deploy@example.com", "createdAt": NOW - 86400_000},
]
SCENES = {"scenes": [{"id": "sc1", "name": "上班", "order": 0, "groups": ["工作"],
                      "includeIds": [], "excludeIds": [], "overrides": {}}],
          "activeSceneId": None}

SEED = """
const sites = %s;
const notes = %s;
const scenes = %s;
localStorage.setItem('CapacitorStorage.web2app.sites.v1', JSON.stringify(sites));
localStorage.setItem('CapacitorStorage.web2app.notes.v1', JSON.stringify(notes));
localStorage.setItem('CapacitorStorage.web2app.scenes.v1', JSON.stringify(scenes));
""" % (json.dumps(SITES, ensure_ascii=False),
       json.dumps(NOTES, ensure_ascii=False),
       json.dumps(SCENES, ensure_ascii=False))

ok = []
fail = []


def check(name, cond, extra=""):
    (ok if cond else fail).append(name)
    print(("  PASS " if cond else "  FAIL ") + name + (f"  <- {extra}" if extra and not cond else ""))


def shot(page, name):
    page.screenshot(path=os.path.join(SHOTS, name + ".png"))


def decode(text):
    body = text.strip()[len(PREFIX):]
    pad = "=" * ((4 - len(body) % 4) % 4)
    return json.loads(base64.urlsafe_b64decode(body + pad).decode("utf-8"))


def norm_newlines(s):
    """Windows 上 Chromium 写剪贴板会把 \\n 规范成 \\r\\n，比较前统一掉"""
    return s.replace("\r\n", "\n")


def long_press(page, locator):
    locator.scroll_into_view_if_needed()
    page.wait_for_timeout(200)
    box = locator.bounding_box()
    page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    page.mouse.down()
    page.wait_for_timeout(650)
    page.mouse.up()


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME)
        ctx = browser.new_context(viewport={"width": 420, "height": 900},
                                  device_scale_factor=2, locale="zh-CN")
        ctx.grant_permissions(["clipboard-read", "clipboard-write"])
        page = ctx.new_page()
        page.add_init_script(SEED)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL, wait_until="networkidle")
        page.wait_for_selector(".card", timeout=8000)

        print("\n[1] 首页底部出现「文本」分区")
        titles = page.locator(".group-title").all_inner_texts()
        check("分区顺序是 工作 → 文本", titles == ["工作", "文本"], str(titles))
        check("渲染了 2 条文本", page.locator(".note-card").count() == 2)
        check("有「添加文本」入口", page.get_by_text("添加文本", exact=True).count() == 1)
        bodies = page.locator(".note-body").all_inner_texts()
        check("卡片显示正文", any("会议室 A" in b for b in bodies), str(bodies))
        meta = page.locator(".note-meta").first.inner_text()
        check("显示相对时间", "小时前" in meta, meta)
        shot(page, "n-01-home-notes")

        print("\n[2] 搜索：文本跟网页一起被过滤")
        box = page.locator('input[type="search"]')
        box.fill("会议室")
        page.wait_for_timeout(250)
        check("只剩匹配的 1 条文本", page.locator(".note-card").count() == 1)
        check("没有匹配的网页 → 分区消失", page.locator(".card").count() == 0)
        check("搜索时不显示「添加文本」", page.get_by_text("添加文本", exact=True).count() == 0)
        check("有匹配文本时不显示「没有匹配」", page.locator(".empty-search").count() == 0)
        shot(page, "n-02-search-note")

        box.fill("deploy")
        page.wait_for_timeout(250)
        check("换关键词命中另一条", page.locator(".note-body").first.inner_text().startswith("ssh -i"),
              page.locator(".note-body").first.inner_text())

        box.fill("完全不存在的词")
        page.wait_for_timeout(250)
        check("全都不匹配 → 提示文案", "没有匹配" in page.locator(".empty-search").inner_text())
        check("全都不匹配 → 文本分区隐藏", page.locator(".note-card").count() == 0)
        box.fill("")
        page.wait_for_timeout(250)

        print("\n[3] 点开一条 → 看全文 + 一键复制")
        page.locator(".note-card").first.click()
        dlg = page.get_by_role("dialog", name="文本")
        dlg.wait_for()
        ta = dlg.locator("textarea")
        check("抽屉里是全文（含换行）", ta.input_value() == NOTES[0]["body"], repr(ta.input_value()))
        dlg.get_by_role("button", name="复制").click()
        page.wait_for_selector("text=已复制到剪贴板")
        clip = page.evaluate("navigator.clipboard.readText()")
        check("剪贴板内容正确（含换行）", norm_newlines(clip) == NOTES[0]["body"], repr(clip)[:80])
        shot(page, "n-03-note-sheet")
        dlg.get_by_label("关闭").click()
        page.wait_for_timeout(350)

        print("\n[4] 长按 → 操作菜单 → 复制（带轻提示）")
        long_press(page, page.locator('.note-card[data-note-id="n2"]'))
        page.wait_for_selector("text=取消")
        items = page.locator(".action-item").all_inner_texts()
        check("菜单是 复制/编辑/删除/取消", items == ["复制", "编辑", "删除", "取消"], str(items))
        page.locator(".action-item", has_text="复制").click()
        page.wait_for_selector(".toast")
        check("出现轻提示", "已复制" in page.locator(".toast").inner_text())
        clip = page.evaluate("navigator.clipboard.readText()")
        check("剪贴板是第二条", norm_newlines(clip) == NOTES[1]["body"], repr(clip)[:60])
        shot(page, "n-04-note-toast")
        page.wait_for_timeout(1900)

        print("\n[5] 新建文本")
        page.get_by_text("添加文本", exact=True).click()
        add_dlg = page.get_by_role("dialog", name="添加文本")
        add_dlg.wait_for()
        check("正文为空时「添加」不可点", add_dlg.get_by_role("button", name="添加", exact=True).is_disabled())
        add_dlg.locator("textarea").fill("取件码 8848\n丰巢 3 号柜")
        add_dlg.get_by_role("button", name="添加", exact=True).click()
        page.wait_for_timeout(350)
        check("列表变成 3 条", page.locator(".note-card").count() == 3)
        check("新条目在最后", "取件码" in page.locator(".note-card").last.inner_text())
        stored = page.evaluate("JSON.parse(localStorage['CapacitorStorage.web2app.notes.v1'])")
        check("已持久化到本机", len(stored) == 3 and stored[-1]["body"].startswith("取件码"), str(len(stored)))

        print("\n[6] 编辑与删除")
        page.locator(".note-card").last.click()
        edit_dlg = page.get_by_role("dialog", name="文本")
        edit_dlg.wait_for()
        edit_dlg.locator("textarea").fill("取件码 8848（已取）")
        edit_dlg.get_by_role("button", name="保存修改").click()
        page.wait_for_timeout(350)
        check("卡片内容已更新", "已取" in page.locator(".note-card").last.inner_text())

        page.locator(".note-card").last.click()
        page.get_by_role("dialog", name="文本").wait_for()
        page.get_by_role("button", name="删除这条文本").click()
        page.wait_for_selector("text=删除文本")
        check("确认框摘要取正文首行", "取件码 8848（已取）" in page.locator(".modal-card").inner_text(),
              page.locator(".modal-card").inner_text())
        page.locator(".modal-btn.destructive").click()
        page.wait_for_timeout(350)
        check("删除后回到 2 条", page.locator(".note-card").count() == 2)
        shot(page, "n-05-after-crud")

        print("\n[7] 场景激活时文本分区仍然显示（文本不参与场景）")
        page.locator(".scene-bar button", has_text="上班").click()
        page.wait_for_timeout(300)
        titles = page.locator(".group-title").all_inner_texts()
        check("场景内仍有「文本」分区", "文本" in titles, str(titles))
        check("场景内文本条数不变", page.locator(".note-card").count() == 2)
        shot(page, "n-06-scene-with-notes")
        page.locator(".scene-bar button", has_text="全部").click()
        page.wait_for_timeout(250)

        print("\n[8] 备份往返：文本进分享码 / JSON，导入后还原")
        page.get_by_label("设置").click()
        sdlg = page.get_by_role("dialog", name="设置")
        sdlg.wait_for()
        sdlg.get_by_text("导出数据", exact=True).click()
        code = sdlg.locator(".srow-detail textarea").first.input_value()
        payload = decode(code)
        check("备份载荷带 notes", len(payload.get("notes") or []) == 2, str(len(payload.get("notes") or [])))
        check("notes 里是正文而非引用", payload["notes"][0]["body"] == NOTES[0]["body"])
        shot(page, "n-07-settings-export")

        # 导入一份「只剩 1 条文本」的备份，确认覆盖生效
        fresh = "W2A1." + base64.urlsafe_b64encode(json.dumps({
            "kind": "backup", "version": 2, "sites": SITES,
            "scenes": [], "notes": [{"id": "x1", "body": "从另一台设备同步过来的文本",
                                     "createdAt": NOW}],
        }, ensure_ascii=False).encode("utf-8")).decode().rstrip("=")
        sdlg.get_by_text("导入数据", exact=True).click()
        sdlg.locator(".srow-detail textarea").nth(1).fill(fresh)
        page.wait_for_selector("text=将覆盖为")
        preview = sdlg.locator(".sheet-body").inner_text()
        check("预览提到文本条数", "1 条文本" in preview, preview[:400])
        sdlg.get_by_role("button", name="导入并覆盖").click()
        page.wait_for_selector("text=已导入")
        check("导入结果提到文本", "1 条文本" in sdlg.locator(".settings-msg").first.inner_text())
        sdlg.get_by_label("关闭").click()
        page.wait_for_timeout(400)
        check("首页只剩 1 条文本", page.locator(".note-card").count() == 1)
        check("内容来自备份", "另一台设备" in page.locator(".note-body").first.inner_text())
        shot(page, "n-08-after-import")

        print("\n[9] 深色模式下的文本与轻提示")
        page.get_by_label("设置").click()
        sdark = page.get_by_role("dialog", name="设置")
        sdark.wait_for()
        sdark.locator('[aria-label="应用主题"] .segment', has_text="深色").click()
        page.wait_for_timeout(250)
        check("应用切到深色", page.evaluate("document.documentElement.dataset.theme") == "dark")
        sdark.get_by_label("关闭").click()
        page.wait_for_timeout(400)
        long_press(page, page.locator(".note-card").first)
        page.wait_for_selector("text=取消")
        page.locator(".action-item", has_text="复制").click()
        page.wait_for_selector(".toast")
        shot(page, "n-09-dark-toast")
        page.wait_for_timeout(1900)

        print("\n[10] 清空全部数据也要清掉文本")
        page.get_by_label("设置").click()
        sdlg2 = page.get_by_role("dialog", name="设置")
        sdlg2.wait_for()
        clear_btn = sdlg2.get_by_text("清空全部数据", exact=True)
        clear_btn.click()
        page.wait_for_timeout(150)
        sdlg2.get_by_text("再点一次确认清空", exact=True).click()
        page.wait_for_timeout(350)
        check("提示文案包含文本", "文本" in sdlg2.locator(".settings-msg").first.inner_text(),
              sdlg2.locator(".settings-msg").first.inner_text())
        sdlg2.get_by_label("关闭").click()
        page.wait_for_timeout(400)
        check("首页文本分区已清空（无卡片）", page.locator(".note-card").count() == 0)
        check("清空后回到空态引导", page.locator(".empty").count() == 1)

        print("\n[11] 无 JS 运行时报错")
        check("没有 pageerror", not errors, "; ".join(errors[:3]))

        browser.close()

    print("\n==== 结果 ====")
    print(f"通过 {len(ok)} / {len(ok) + len(fail)}")
    for f in fail:
        print("  未通过：" + f)
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main())
