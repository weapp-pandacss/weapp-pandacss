from pathlib import Path
import json
import re
import xml.etree.ElementTree as ET
import shutil
import zipfile

ROOT = Path(__file__).parent
NS = '{http://www.w3.org/2000/svg}'
YELLOW, GREEN, INK = '#FACC15', '#07C160', '#111111'


def source(name):
    root = ET.parse(ROOT / 'sources' / f'{name}.svg').getroot()
    for child in root.iter():
        tag = child.tag.removeprefix(NS)
        if tag not in {'svg', 'path', 'g', 'defs', 'clipPath', 'rect', 'circle', 'linearGradient', 'stop'}:
            raise ValueError(f'Unexpected SVG element: {tag}')
    return ''.join(ET.tostring(child, encoding='unicode').replace('ns0:', '').replace(':ns0', '') for child in root)


PANDA = source('panda-logo')
MASCOT = source('panda-mascot')
MINIAPP = source('miniapp-original')
mini_path = ET.parse(ROOT / 'sources' / 'miniapp-original.svg').getroot()[0].attrib['d']
GLYPH = mini_path.split('ZM50 100')[0] + 'Z'
if not mini_path.startswith(GLYPH[:-1]) or 'ZM50 100' not in mini_path:
    raise ValueError('Mini-app compound path changed')


def nest(body, x, y, w, h=None, view='0 0 15 15'):
    return f'<svg x="{x}" y="{y}" width="{w}" height="{h if h is not None else w}" viewBox="{view}" fill="none">{body}</svg>'


def panda(x, y, size):
    return nest(PANDA, x, y, size)


def mini(x, y, size):
    return nest(MINIAPP, x, y, size, view='0 0 100 100')


def glyph(x, y, w, h=None, color='white'):
    return nest(f'<path d="{GLYPH}" fill="{color}"/>', x, y, w, h, '18 21 64 58')


def mascot(x, y, w, h=None, view='0 0 197 261'):
    return nest(MASCOT, x, y, w, h if h is not None else w * 261 / 197, view)


def svg(body, title, view='0 0 512 512', width=512, height=512):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="{view}" fill="none" role="img" aria-label="{title}"><title>{title}</title>{body}</svg>'


versions = [
    ('A', 'corner-badge', '角标组合', '官方 P 为主体，绿色小程序标识作角标。', '适合 GitHub 组织头像',
     f'<rect x="52" y="52" width="358" height="358" rx="78" fill="{YELLOW}"/>'
     + panda(132, 112, 208)
     + '<circle cx="375" cy="375" r="87" fill="white"/>'
     + mini(300, 300, 150)),
    ('B', 'twin-marks', '并列双标', '两个原始标志并列，双方身份一眼可见。', '适合文档和横版标识',
     f'<rect x="36" y="134" width="238" height="244" rx="54" fill="{YELLOW}"/>'
     + panda(70, 188, 133)
     + '<circle cx="348" cy="256" r="132" fill="white"/>'
     + mini(228, 136, 240)),
    ('C', 'split-seal', '双色圆章', '把 P 与小程序符号收进同一枚双色圆章。', '适合图标与品牌贴纸',
     '<defs><clipPath id="seal"><circle cx="256" cy="256" r="202"/></clipPath></defs>'
     + f'<g clip-path="url(#seal)"><circle cx="256" cy="256" r="202" fill="{YELLOW}"/>'
     + f'<path d="M266 54H458V458H218C279 358 292 161 266 54Z" fill="{GREEN}"/>'
     + panda(106, 174, 135)
     + glyph(302, 195, 107, 107) + '</g>'),
    ('D', 'open-symbols', '开放组合', '去掉外框，用两个符号构成紧凑的组合标。', '适合极简页面和组件标识',
     panda(60, 139, 238)
     + glyph(279, 171, 173, 173, GREEN)),
    ('E', 'mascot-badge', '熊猫徽章', '官方熊猫搭配小程序胸章，更有项目亲和力。', '适合社区头像和宣传物料',
     f'<circle cx="256" cy="248" r="199" fill="{YELLOW}"/>'
     + mascot(122, 47, 268)
     + '<circle cx="269" cy="314" r="56" fill="white"/>'
     + mini(219, 264, 100)),
    ('F', 'mascot-peek', '熊猫探头', '熊猫探出绿色标章，突出小程序场景。', '适合头像和社群入口',
     f'<circle cx="256" cy="280" r="179" fill="{GREEN}"/>'
     + '<defs><clipPath id="head"><rect x="95" y="42" width="322" height="252" rx="30"/></clipPath><clipPath id="peekCircle"><circle cx="256" cy="280" r="179"/></clipPath></defs>'
     + '<g clip-path="url(#head)">' + mascot(114, 42, 287) + '</g>'
     + f'<path d="M92 296Q256 241 420 296V372H92Z" fill="{GREEN}" clip-path="url(#peekCircle)"/>'
     + glyph(204, 322, 108, 104)),
]

out = ROOT / 'variants'
out.mkdir(exist_ok=True)
manifest = []
for code, slug, name, description, use, body in versions:
    filename = f'{code.lower()}-{slug}'
    (out / f'{filename}.svg').write_text(svg(body, f'weapp-pandacss / {code} {name}'))
    manifest.append(dict(code=code, slug=slug, name=name, description=description, use=use, file=filename))
(ROOT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
shutil.copyfile(out / 'a-corner-badge.svg', ROOT / 'logo.svg')

# A quiet comparison sheet; the marks themselves carry the color.
sheet = '<rect width="1536" height="1330" fill="#F6F8F7"/>'
sheet += '<text x="60" y="70" font-family="Avenir Next,Arial,sans-serif" font-size="21" font-weight="600" fill="#53655B" letter-spacing="2">WEAPP-PANDACSS</text>'
sheet += '<text x="60" y="126" font-family="PingFang SC,Hiragino Sans GB,sans-serif" font-size="40" font-weight="600" fill="#14291C">Panda CSS × 小程序</text>'
sheet += '<text x="1476" y="126" text-anchor="end" font-family="PingFang SC,sans-serif" font-size="18" fill="#66776D">六种组合方向 · SVG / PNG</text>'
for i, (code, slug, name, description, use, body) in enumerate(versions):
    x = 60 + (i % 3) * 484
    y = 172 + (i // 3) * 544
    sheet += f'<rect x="{x}" y="{y}" width="448" height="508" rx="18" fill="white" stroke="#DEE6E0"/>'
    sheet += f'<text x="{x + 26}" y="{y + 40}" font-family="Avenir Next,sans-serif" font-size="21" font-weight="600" fill="#76857B">{code}</text>'
    sheet += nest(body, x + 54, y + 58, 340, view='0 0 512 512')
    sheet += f'<path d="M{x + 26} {y + 410}H{x + 422}" stroke="#E8EDE9"/>'
    sheet += f'<text x="{x + 26}" y="{y + 448}" font-family="PingFang SC,Hiragino Sans GB,sans-serif" font-size="25" font-weight="600" fill="#172E20">{name}</text>'
    sheet += f'<text x="{x + 26}" y="{y + 481}" font-family="PingFang SC,Hiragino Sans GB,sans-serif" font-size="17" fill="#68776E">{use}</text>'
sheet += '<text x="60" y="1300" font-family="PingFang SC,Hiragino Sans GB,sans-serif" font-size="17" fill="#66776D">图形来源：Panda CSS 官方素材 + 你提供的 Vector.svg。均保留可编辑矢量文件。</text>'
(ROOT / 'preview.svg').write_text(svg(sheet, 'weapp-pandacss 六种 logo 方案', '0 0 1536 1330', 1536, 1330))

# Prefix SVG ids so inline previews stay independent.
cards = []
for code, slug, name, description, use, body in versions:
    body = re.sub(r'id="([^"]+)"', lambda m: f'id="{code}-{m[1]}"', body)
    body = re.sub(r'url\(#([^\)]+)\)', lambda m: f'url(#{code}-{m[1]})', body)
    art = svg(body, f'{code} {name}')
    file = f'{code.lower()}-{slug}'
    cards.append(f'''<article><div class="label">{code} <span>{name}</span></div><div class="stage">{art}</div><p>{description}</p><small>{use}</small><footer><a href="variants/{file}.svg" download>下载 SVG</a><a href="variants/{file}.png" download>下载 PNG</a></footer></article>''')

html = '''<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>weapp-pandacss · Logo 方案</title><style>
:root{color-scheme:light;--bg:#f6f8f7;--paper:#fff;--ink:#172e20;--muted:#68776e;--line:#dee6e0;--size:270px}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:"Avenir Next","PingFang SC",sans-serif}main{max-width:1440px;margin:auto;padding:48px 36px}header{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-bottom:30px}.eyebrow{font-size:13px;font-weight:600;letter-spacing:2px;color:var(--muted)}h1{font-size:clamp(28px,4vw,44px);margin:12px 0}header p{margin:0;color:var(--muted);line-height:1.6}.controls{display:flex;flex-wrap:wrap;gap:14px;align-items:center;font-size:14px}button,a{font:inherit}button{border:1px solid var(--line);background:var(--paper);color:var(--ink);border-radius:8px;padding:10px 15px;cursor:pointer}input{accent-color:#07c160;width:110px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}article{border:1px solid var(--line);border-radius:16px;background:var(--paper);padding:24px;overflow:hidden}.label{display:flex;gap:12px;color:var(--muted);font-size:18px;font-weight:600}.label span{color:var(--ink)}.stage{height:320px;display:grid;place-items:center}.stage svg{width:var(--size);height:var(--size);max-width:100%;transition:width .18s,height .18s}p{font-size:14px;line-height:1.7;margin:0 0 7px}small{color:var(--muted);font-size:13px}footer{display:flex;gap:22px;border-top:1px solid var(--line);margin-top:22px;padding-top:18px}a{color:var(--ink);text-decoration-thickness:1px;text-underline-offset:5px;font-size:14px}.note{margin-top:28px;color:var(--muted);font-size:13px;line-height:1.7}body.dark{color-scheme:dark;--bg:#16221b;--paper:#223129;--ink:#eff6f1;--muted:#abc1b1;--line:#3b5041}a:focus-visible,button:focus-visible,input:focus-visible{outline:3px solid #07c160;outline-offset:4px}@media(max-width:1050px){.grid{grid-template-columns:repeat(2,1fr)}header{align-items:flex-start;flex-direction:column}}@media(max-width:640px){main{padding:30px 18px}.grid{grid-template-columns:1fr}.stage{height:290px}}@media(prefers-reduced-motion:reduce){.stage svg{transition:none}}
</style><main><header><div><div class="eyebrow">WEAPP-PANDACSS</div><h1>Panda CSS × 小程序</h1><p>六种组合方向，切换背景与大小比较实际效果。</p></div><div class="controls"><button id="theme" type="button" aria-pressed="false">切换深色背景</button><label>图标大小 <input id="size" type="range" min="40" max="300" value="270" aria-label="图标大小"></label><a href="weapp-pandacss-logo-options.zip" download>下载全部</a></div></header><section class="grid">'''
html += ''.join(cards)
html += '''</section><p class="note">图形来源：<a href="https://panda-css.com/brand" target="_blank" rel="noopener">Panda CSS 官方素材</a>与提供的 Vector.svg。<br>SVG 为可编辑矢量；PNG 为 1024 × 1024 透明背景。A 更适合项目头像，D 更适合简洁的文档标识。</p></main><script>document.getElementById('theme').addEventListener('click',function(){const dark=document.body.classList.toggle('dark');this.setAttribute('aria-pressed',String(dark));this.textContent=dark?'切换浅色背景':'切换深色背景'});document.getElementById('size').addEventListener('input',function(){document.documentElement.style.setProperty('--size',this.value+'px')});</script></html>'''
(ROOT / 'preview.html').write_text(html)
(ROOT / 'README.md').write_text('''# weapp-pandacss Logo 方案

打开 `preview.html` 对比六版，可切换浅色/深色背景与显示大小。

- A：角标组合，推荐用作 GitHub 组织头像。
- B：并列双标，适合横向文档标识。
- C：双色圆章，适合图标与贴纸。
- D：开放组合，适合简洁的项目标识。
- E：熊猫徽章，适合社群头像。
- F：熊猫探头，适合轻松的社区风格。

`variants/` 包含每版透明 SVG 与 1024px PNG；`preview.png` 是总览。

素材出处：

- 用户提供的 `Vector.svg`，原样保存到 `sources/miniapp-original.svg`。
- Panda CSS 官方 Logo：<https://panda-css.com/panda-p-letter.svg>
- Panda CSS 官方吉祥物：<https://panda-css.com/panda-hello.svg>
- 官方素材页：<https://panda-css.com/brand>

已选 A「角标组合」作为 weapp-pandacss 的项目标识及 GitHub 组织头像。
`logo.svg` 是选定的矢量文件，`avatar.png` 是用于上传组织头像的白底 1024px 文件。

运行 `python3 assets/brand/build.py` 可重新生成 SVG、预览 HTML 与下载包。
PNG 是从对应 SVG 导出的 1024px 图；修改图形后请同时重新导出 PNG 和总览。
''')
files = [ROOT / name for name in ['preview.png', 'preview.svg', 'preview.html', 'README.md', 'manifest.json', 'build.py', 'logo.svg', 'avatar.png']]
files += sorted(out.glob('*'))
files += [ROOT / 'sources' / name for name in ['miniapp-original.svg', 'panda-logo.svg', 'panda-mascot.svg']]
with zipfile.ZipFile(ROOT / 'weapp-pandacss-logo-options.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in files:
        if file.is_file():
            archive.write(file, file.relative_to(ROOT))
print('Created 6 SVG options, comparison sheet and interactive preview.')
