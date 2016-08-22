# gulp-webp-collector

> 搜寻页面中的img标签图片，适配webp格式图片
> 同时也支持适配video标签的poster图片
> 还支持css样式表适配webp版本

## 适配页面
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

## 适配css样式表。  

适配前：
```css
.test {
  background: url(/assets/images/test.jpg);
}
```

适配后：
```css
.test {
  background: url(/assets/images/test.jpg);
}
html.webp .test {
  background-image: url(/assets/images/test.webp);
}
```
