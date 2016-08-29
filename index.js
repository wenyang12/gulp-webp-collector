/**
 * 搜寻页面中的img标签图片，适配webp格式图片
 * 适配后的img标签是懒加载模式
 * >>>同时也支持适配video标签的poster图片
 * 1. 适配前：<img src="/assets/images/test.png">
 * 2. 适配后：<img class="j-webp" data-src="/assets/images/test.png" data-webp-src="/assets/images/test.webp">
 * 支持指定私有属性`_nowebp`来跳过适配，如：
 * <img src="/assets/images/demo.png" _nowebp>
 * 同时还会搜索页面引用的css样式表，并适配样式中的图片
 * @author luoying
 */

'use strict';

const fs = require('fs');
const path = require('path');
const through2 = require('through2');
const gutil = require('gulp-util');
const File = gutil.File;
const getMatchs = require('@tools/matchs');

// 搜索img标签
const REG_IMG = /<(?:img|video).*\s+(?:src|poster)=["|']([^"']+)["|'][^>]*>/gi;
const REG_IMG_ALL = /(?:src|poster)=["|']([^"']+)["|']/gi;
// 匹配className属性
const REG_CLASSNAME = /class=["|']([^"']+)["|']/i;
// 匹配img标签闭合符号
const REG_CLOSETAG = /(\/?>)$/;

// 匹配css资源，link外链或style内联样式
const REG_CSS = /<link.*href=["|'](.+\.css)["|'].*\/?>/gi;
// 匹配css中的图片资源
const REG_CSS_ASSETS = /url\(([^\)]+)\)/gi;

const getOptions = (options) => {
  let opts = Object.assign({
    prefix: 'html.webp',
    className: 'j-webp',
    imageTypes: 'jpg,jpeg,png',
    ignoreAttr: '_nowebp'
  }, options || {});
  opts.imageTypes = opts.imageTypes.split(',').join('|');
  return opts;
};

const isSpecialType = (src, types) => new RegExp(`\\.(${types})$`, 'i').test(src);

// 提取img标签上的className属性
const getClassName = (img) => {
  let match = img.match(REG_CLASSNAME);
  return match ? match[1] : '';
};

const replaceClassName = (img, className) => {
  let has = REG_CLASSNAME.test(img);
  return img.replace(has ? REG_CLASSNAME : REG_CLOSETAG, has ? `class="${className}"` : ` class="${className}"$1`);
};

// 获取页面上的css样式表
const getStyles = (html, base) => {
  let styles = [];
  let styleMatchs = getMatchs(html, REG_CSS);

  styleMatchs.forEach(match => {
    let link = match[1];
    let content = fs.readFileSync(path.join(base, link), 'utf8');
    content && styles.push({
      link: link,
      content: content
    });
  });

  return styles;
};

// 从页面上搜集图片
const collectPage = (html, options) => {
  let imgs = [];
  let matchs = getMatchs(html, options.all ? REG_IMG_ALL : REG_IMG);

  matchs.forEach(match => {
    let img = match[0];
    // 包含忽略私有属性的img标签，略过
    if (options.ignoreAttr && img.indexOf(options.ignoreAttr) >= 0) return;

    let src = match[1];
    // 当图片不符合指定的图片类型，略过
    if (!isSpecialType(src, options.imageTypes)) return;

    imgs.push({
      tag: img,
      src: src
    });
  });

  return imgs;
};

// 从样式表中提取图片
const collectStyle = (style, options) => {
  let imgs = [];
  let matchs = getMatchs(style, REG_CSS_ASSETS);

  matchs.forEach(match => {
    let src = match[1];
    // 当图片不符合指定的图片类型，略过
    if (!isSpecialType(src, options.imageTypes)) return;
    imgs.push({
      rule: match[0],
      src: src
    });
  });
  return imgs;
};

// 匹配并替换页面中的img标签：data-src & data-webp-src
const replacePage = (html, options) => {
  let imgs = collectPage(html, options);

  for (let img of imgs) {
    let tag = img.tag;
    let src = img.src;
    // 视频标签
    let isViedeo = /^<video/.test(tag);

    // 替换src为data-src，懒加载模式
    tag = tag.replace(/(src|poster)=/, 'data-$1=');

    // 得出同名不同后缀的webp图片url
    let webpSrc = src.replace(new RegExp(`\\.(${options.imageTypes})$`, 'i'), '.webp');
    // data-webp-src附加在img最后
    tag = tag.replace(REG_CLOSETAG, ` data-webp-${isViedeo ? 'poster' : 'src'}="${webpSrc}"$1`);

    let className = getClassName(tag);
    // 加上指定className标识，以便业务脚本能够检测是否加载webp图片
    if (className.indexOf(options.className) === -1) {
      className += (className ? ' ' : '') + options.className;
      tag = replaceClassName(tag, className);
    }

    html = html.replace(img.tag, tag);
  }

  return html;
};

// 匹配样式表中的图片规则，新增一条webp版本的新规则
const replaceStyle = (style, options) => {
  let imgs = collectStyle(style, options);

  for (let img of imgs) {
    let src = img.src;
    // webp版本图片
    let webpSrc = src.replace(new RegExp(`\\.(${options.imageTypes})$`, 'i'), '.webp');

    // 此图片样式规则所在位置
    let index = style.indexOf(img.rule);
    // 此图片样式规则的开始大括号位置
    let prefix = style.lastIndexOf('{', index);
    // 此图片样式规则的结束大括号位置
    let suffix = style.indexOf('}', index);
    // 此图片样式规则名的开始位置
    let start = style.lastIndexOf('}', prefix);

    // 获取样式规则名
    let name = style.substring(start + 1, prefix);
    // webp图片样式规则
    let webpRule = `${options.prefix} ${name}{background-image:url(${webpSrc})}`;
    // 在此图片样式规则之后插入一条webp图片样式规则
    style = style.slice(0, suffix + 1) + webpRule + style.slice(suffix + 1);
  }

  return style;
};

// 收集页面上的图片，包括引用的css样式表中的图片
module.exports.collect = (options) => {
  options = getOptions(options);
  return through2.obj(function(file, enc, callback) {
    if (file.isNull()) return callback(null, file);

    let base = file.base;
    let html = file.contents.toString();

    // 搜集页面上的img标签图片
    let imgs = collectPage(html, options);

    // 提取页面引用的css样式表
    let styles = getStyles(html, base);
    for (let style of styles) {
      // 搜集样式表中的图片
      let s = collectStyle(style.content, options);
      imgs.push.apply(imgs, s);
    }

    for (let img of imgs) {
      let pathname = path.join(base + img.src);
      try {
        let contents = fs.readFileSync(pathname);
        let file = new File({
          base: base,
          path: options.base ? path.join(options.base, path.basename(img.src)) : path.join(base, img.src),
          contents: contents
        });
        this.push(file);
      } catch (e) {
        console.log(`not found the ${pathname}`);
      }
    }

    callback();
  });
};

// 将页面上的图片适配webp版本，包括引用的css样式表中的图片
module.exports.replace = (options) => {
  options = getOptions(options);
  return through2.obj(function(file, enc, callback) {
    if (file.isNull()) return callback(null, file);

    let base = file.base;
    let html = file.contents.toString();
    file.contents = new Buffer(replacePage(html, options));

    let styles = getStyles(html, base);
    for (let style of styles) {
      style.content = replaceStyle(style.content, options);
      this.push(new File({
        base: base,
        path: path.join(base, style.link),
        contents: new Buffer(style.content)
      }));
    }

    callback(null, file);
  });
};
