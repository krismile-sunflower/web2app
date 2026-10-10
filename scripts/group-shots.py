"""验证「未分组」概念归一化：分组不再是可勾选项，未分组有独立开关。

跑法（system Python 3.11 里有 playwright 1.49.1）：
  P3_URL=http://127.0.0.1:4180/ \
  C:/Users/89221/AppData/Local/Programs/Python/Python311/python.exe scripts/group-shots.py
前置：先 `npm run build`，再在同一条命令里起本地静态服务（沙箱不保留跨调用进程）。
"""
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

# 关键前置：数据里故意混入一个「手填未分组」的站点和一个真正未分组的站点，
# 归一化后两者必须合并到同一个「未分组」分区，且分组里只剩「工作」一个真实分组。
SITES = [
    {"id": "s1", "url": "https://news.example.com/", "name": "资讯", "group": "工作",
     "pinned": False, "ua": "default", "createdAt": 1},
    {"id": "s2", "url": "https://mail.example.com/", "name": "邮箱", "group": "工作",
     "pinned": False, "ua": "default", "createdAt": 2},
    {"id": "s3", "url": "https://quote.example.com/", "name": "行情", "group": "看盘",
     "pinned": False, "ua": "default", "createdAt": 3},
    {"id": "s4", "url": "https://blog.example.com/", "name": "博客", "group": "",
     "pinned": False, "ua": "default", "createdAt": 4},
    # 用户手填了「未分组」当分组名 —— 旧数据里的污染
    {"id": "s5", "url": "https://wiki.example.com/", "name": "百科", "group": "未分组",
     "pinned": False, "ua": "default", "createdAt": 5},
]
SCENES = {"scenes": [], "activeSceneId": None}

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
        ctx = browser.new_context(viewport={"width": 420, "height": 900},
                                  device_scale_factor=2, locale="zh-CN")
        page = ctx.new_page()
        page.add_init_script(SEED)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL, wait_until="networkidle")
        page.wait_for_selector(".card", timeout=8000)

        print("\n[1] 首页：手填「未分组」的站点被归一化，与真未分组合并")
        # 「文本」是独立分区（不参与分组），单独摘掉再看网页分区
        sections = [t for t in page.locator(".group-title").all_inner_texts() if t != "文本"]
        check("网页分区只有「工作 / 看盘 / 未分组」三个", sorted(sections) == sorted(["工作", "看盘", "未分组"]),
              str(sections))
        names = page.locator(".card .card-name").all_inner_texts()
        check("5 个站点全部还在", len(names) == 5, str(names))
        meta = page.locator(".topbar-meta").first.inner_text()
        check("分组计数为 3（未分组算一个分区）", "3 个分组" in meta, meta)
        # 关键：手填「未分组」的站点必须和真未分组的站点落到同一个分区，而不是各占一个
        ungrouped = page.locator(".group").filter(
            has=page.locator(".group-title", has_text="未分组"))
        check("未分组分区里正好 2 个站点（博客 + 百科）", ungrouped.locator(".card").count() == 2,
              str(ungrouped.locator(".card-name").all_inner_texts()))
        shot(page, "g-01-home-merged")

        print("\n[2] 场景编辑页：分组里不再出现「未分组」")
        page.get_by_label("设置").click()
        dlg = page.get_by_role("dialog", name="设置")
        dlg.wait_for()
        dlg.get_by_text("管理场景", exact=True).click()
        scene_dlg = page.get_by_role("dialog", name="场景")
        scene_dlg.wait_for()
        scene_dlg.get_by_text("新建场景", exact=True).click()
        page.wait_for_selector("text=按分组纳入")
        group_box = page.locator(".srow-col").filter(has_text="按分组纳入")
        chips = group_box.locator(".chip").all_inner_texts()
        check("分组 chip 只剩真实分组", sorted(chips) == ["工作", "看盘"], str(chips))
        check("「未分组」不再作为分组 chip 出现", "未分组" not in chips, str(chips))
        check("有独立的「包含未分组的站点」开关", page.get_by_label("包含未分组的站点").count() == 1)
        sub = scene_dlg.locator(".sheet-body").inner_text()
        check("开关说明写明未分组站点数", "把 2 个没有设置分组的站点也纳入" in sub, sub[:400])
        shot(page, "g-02-scene-groups")

        print("\n[3] 开关与分组选择都能真实生效")
        page.get_by_label("包含未分组的站点").click()
        page.wait_for_timeout(150)
        note = page.locator(".settings-note").first.inner_text()
        check("只勾未分组 → 2 个站点", "当前包含 2 个站点" in note, note)
        group_box.locator(".chip", has_text="工作").click()
        page.wait_for_timeout(150)
        note = page.locator(".settings-note").first.inner_text()
        check("再勾「工作」→ 4 个站点", "当前包含 4 个站点" in note, note)
        shot(page, "g-03-scene-ungrouped-on")

        print("\n[4] 保存后场景匹配与首页过滤一致")
        scene_dlg.locator(".srow-col .form-input").first.fill("全都要")
        page.get_by_role("button", name="保存", exact=True).click()
        page.wait_for_selector("text=全都要")
        scene_dlg.get_by_label("关闭").click()
        page.wait_for_timeout(400)
        page.locator(".scene-bar button", has_text="全都要").click()
        page.wait_for_timeout(300)
        shown = page.locator(".card .card-name").all_inner_texts()
        check("场景内显示 4 个站点", len(shown) == 4, str(shown))
        check("场景内不含「看盘」的行情", "行情" not in shown, str(shown))
        meta = page.locator(".topbar-meta").first.inner_text()
        check("场景内分组计数为 2（工作 + 未分组）", "2 个分组" in meta, meta)
        shot(page, "g-04-scene-active")

        print("\n[5] 场景持久化里存的仍是哨兵值（分享码兼容）")
        sc = page.evaluate("JSON.parse(localStorage['CapacitorStorage.web2app.scenes.v1'])")
        groups = sc["scenes"][0]["groups"]
        check("groups 里用「未分组」表示空分组", sorted(groups) == ["工作", "未分组"], str(groups))

        print("\n[6] 站点编辑页分组输入不再误导")
        page.locator(".scene-bar button", has_text="全部").click()
        page.wait_for_timeout(300)
        # 直接开「百科」（旧数据里 group 手填了「未分组」）的编辑页，验证内存里已被归一化
        card = page.locator('.card[data-site-id="s5"]')
        card.scroll_into_view_if_needed()
        page.wait_for_timeout(200)
        box = card.bounding_box()
        page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        page.mouse.down()
        page.wait_for_timeout(650)
        page.mouse.up()
        page.wait_for_selector("text=编辑")
        page.get_by_text("编辑", exact=True).click()
        editor = page.get_by_role("dialog", name="编辑网页")
        editor.wait_for()
        ph = editor.locator('input[placeholder="留空即未分组"]')
        ph.wait_for()
        check("placeholder 改成「留空即未分组」", ph.count() == 1)
        check("手填「未分组」的站点读出来是空的（已归一化）", ph.input_value() == "",
              repr(ph.input_value()))
        chips = editor.locator(".chip-row .chip").all_inner_texts()
        check("站点编辑页的快捷分组也只剩真实分组", "未分组" not in chips, str(chips))
        shot(page, "g-05-site-editor-group")

        print("\n[7] 写入一次后，存储里的脏值也自愈")
        page.get_by_role("button", name="保存修改", exact=True).click()
        page.wait_for_timeout(400)
        stored = page.evaluate("JSON.parse(localStorage['CapacitorStorage.web2app.sites.v1'])")
        groups = {s["name"]: s["group"] for s in stored}
        check("存储里「百科」的 group 已变成空串", groups.get("百科") == "", str(groups))

        print("\n[8] 无 JS 运行时报错")
        check("没有 pageerror", not errors, "; ".join(errors[:3]))

        browser.close()

    print("\n==== 结果 ====")
    print(f"通过 {len(ok)} / {len(ok) + len(fail)}")
    for f in fail:
        print("  未通过：" + f)
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main())
