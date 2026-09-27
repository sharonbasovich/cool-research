# Social preview image

`public/og.png` (1200×630) is rendered from `og.html` with headless Chrome:

```sh
google-chrome --headless=new --hide-scrollbars --window-size=1200,800 \
  --screenshot=/tmp/og.png "file://$PWD/scripts/og/og.html"
# then crop the top 1200×630 into public/og.png
```
