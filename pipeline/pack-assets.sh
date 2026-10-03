#!/bin/bash
# pack-assets.sh — pack process materials from the real run into static assets.
#
# 用法：bash pipeline/pack-assets.sh [SRC] [OUT]（79 期：脚本搬入 pipeline/；纯 PWD 口径，路径随参数走）
#   SRC = 过程素材快照（82 期数据源整体替换后的真源 = /home/user/code/temp/
#         black_hat_usa_2026；派生 worktree 内一律显式传 <worktree>/materials）
#   OUT = 落点（默认 $PWD/public/assets；母本/主仓库以外的落点须显式传，禁止写主仓库）
# 结构假设（第 82 次重锚，跟新会话 black_hat_usa_2026 的素材布局）：
#   $SRC/figures/*.jpg   20 张成图（1280px）
#   $SRC/frames/f_*.png  179 帧密集样本（fps=1/15）→ 联系表（每 7 帧 1 张）；
#                        另按 figure_manifest.tsv 的 frame 列落 20 张**成图源帧**
#                        （960px，s2 抽帧探头覆盖层与图-帧对照的唯一图源；未入选
#                        密集帧不单独落盘——179 帧全景由联系表承载）
#   $SRC/cover.jpg       封面（960px）
#   $SRC/notes.pdf       笔记 → 33 页渲染页（pdftoppm -r 100）+ PDF 本体字节拷贝
#                        （run 页「下载笔记」锚点）
# 83 期：**视频不再打包**——产品无 mp4 播放功能，s2 抽帧探头的全部可见信息由
#   assets/frames/ 的同秒帧图承载（82 期已随本脚本打包）。82 期引入的 ffmpeg
#   重编码块（44.2 MB 960×540 H.264 无音轨副本）随 <video> 通道退休而删除；
#   DOWNLOAD.endpoint 仍述源下载事实（710 538 461 B / VP9 / 1920×1080），源视频
#   真身保留在 materials/ 不动。退休裁决见 docs/Explore_83.md §1.2。
set -e
SRC=${1:-/home/user/code/temp/black_hat_usa_2026}
OUT=${2:-$PWD/public/assets}
echo "packing $SRC -> $OUT (原生物：cpSync 到 dist 根，不经构建)"
rm -rf "$OUT"; mkdir -p "$OUT/figures" "$OUT/frames" "$OUT/pages"

# 20 final teaching figures (downscaled to 1280px)
for f in "$SRC"/figures/*.jpg; do
  b=$(basename "$f")
  magick "$f" -resize 1280x -quality 82 "$OUT/figures/$b"
done

# 成图源帧（figure_manifest.tsv frame 列 → assets/frames/f_NNN.jpg，960px）：
# tsv 首列 figure（assets/figures 同名）、次列 frame（materials/frames 相对路径）。
# 未入选帧不落盘——演示用图集 = 成图 + 其源帧一一对照，密集样本全景由 contact 承载。
while IFS=$'\t' read -r figure frame rest; do
  case "$frame" in
    frames/f_*.png) ;;
    *) continue ;;
  esac
  src="$SRC/$frame"
  [ -f "$src" ] || continue
  magick "$src" -resize 960x -quality 80 "$OUT/frames/$(basename "$frame" .png).jpg"
done < "$SRC/figure_manifest.tsv"

# cover
magick "$SRC/cover.jpg" -resize 960x -quality 82 "$OUT/cover.jpg"

# rendered PDF pages (33 页)
pdftoppm -jpeg -r 100 "$SRC/notes.pdf" "$OUT/pages/page"

# contact sheet of the dense frame sample (every 7th frame of 179)
FILES=$(ls "$SRC"/frames/f_*.png | awk 'NR%7==1')
magick montage $FILES -tile 6x -geometry 320x180+2+2 -quality 80 "$OUT/contact.jpg"

# lecture notes PDF (iteration 75): the run-page 交付卡「下载笔记」锚点的自携
# 本体 —— 纯字节拷贝（下载语义要求产物里就是真 PDF）
cp -f "$SRC/notes.pdf" "$OUT/notes.pdf"

echo "--- packed ---"
du -sh "$OUT"; find "$OUT" -type f | wc -l
