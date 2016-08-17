# gulp-webp-adapter

> 搜寻页面中的img标签图片，适配webp格式图片


适配后的img标签是懒加载模式。

适配前：
```html
<img src="/assets/images/test.png">
```

适配后：
```html
<img class="j-webp" data-src="/assets/images/test.png" data-webp-src="/assets/images/test.webp">
```

支持指定私有属性`_nowebp`来跳过适配，如：
```html
<img src="/assets/images/demo.png" _nowebp>
```