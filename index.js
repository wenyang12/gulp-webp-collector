/**
 * 搜寻页面中的img标签图片，适配webp格式图片
 * 适配后的img标签是懒加载模式
 * >>>同时也支持适配video标签的poster图片
 * 1. 适配前：<img src="/assets/images/test.png">
 * 2. 适配后：<img class="j-webp" data-src="/assets/images/test.png" data-webp-src="/assets/images/test.webp">
 * 支持指定私有属性`_nowebp`来跳过适配，如：
 * <img src="/assets/images/demo.png" _nowebp>
 * @author luoying
 */

'use strict';

const fs = require('fs');
const path = require('path');
const through2 = require('through2');
const gutil = require('gulp-util');
const File = gutil.File;

// 搜索img标签
const REG_IMG = /<(?:img|video).*\s+(?:src|poster)=["|']([^"']+)["|'][^>]*>/gi;
// 匹配className属性
const REG_CLASSNAME = /class=["|']([^"']+)["|']/i;
// 匹配img标签闭合符号
const REG_CLOSETAG = /(\/?>)$/;

// 匹配css中的图片资源
const REG_CSS_ASSETS = /url\(([^\)]+)\)/gi;

const getMatchs = (data, reg) => {
  let matchs = [];
  let match = null;
  while ((match = reg.exec(data))) {
    matchs.push(match);
  }
  return matchs;
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

const getTypes = (options) => options.imageTypes.split(',').join('|');

// 匹配并替换页面中的img标签：data-src & data-webp-src
const replace = (html, options) => {
  let types = getTypes(options);
  let imgs = getPageImages(html, options);
  for (let img of imgs) {
    let tag = img.tag;
    let src = img.src;
    // 视频标签
    let isViedeo = /^<video/.test(tag);

    // 替换src为data-src，懒加载模式
    tag = tag.replace(/(src|poster)=/, 'data-$1=');

    // 得出同名不同后缀的webp图片url
    let webpSrc = src.replace(new RegExp(`\\.(${types})$`, 'i'), '.webp');
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

const replaceCSS = (style, options) => {
  let types = getTypes(options);
  let imgs = getStyleImages(style, options);

  for (let img of imgs) {
    let src = img.src;
    // webp版本图片
    let webpSrc = src.replace(new RegExp(`\\.(${types})$`, 'i'), '.webp');

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

// 从样式表中提取图片
const getStyleImages = (style, options) => {
  let imgs = [];
  let types = getTypes(options);
  let matchs = getMatchs(style, REG_CSS_ASSETS);

  matchs.forEach(match => {
    let src = match[1];
    // 当图片不符合指定的图片类型，略过
    if (!isSpecialType(src, types)) return;
    imgs.push({
      rule: match[0],
      src: src
    });
  });
  return imgs;
};

// 从页面上提取图片
const getPageImages = (html, options) => {
  let imgs = [];
  let types = getTypes(options);
  let matchs = getMatchs(html, REG_IMG);

  matchs.forEach(match => {
    let img = match[0];
    // 包含忽略私有属性的img标签，略过
    if (img.indexOf(options.ignoreAttr) >= 0) return;

    let src = match[1];
    // 当图片不符合指定的图片类型，略过
    if (!isSpecialType(src, types)) return;

    imgs.push({
      tag: img,
      src: src
    });
  });

  return imgs;
};

const getOptions = (options) => {
  return Object.assign({
    prefix: 'html.webp',
    className: 'j-webp',
    imageTypes: 'jpg,jpeg,png',
    ignoreAttr: '_nowebp'
  }, options || {});
};

const _collect = function(collector, options) {
  return function(file, enc, callback) {
    if (file.isNull()) {
      return callback(null, file);
    }

    let base = options.base || path.dirname(file.path);
    let html = file.contents.toString();
    let imgs = collector(html, options);

    let files = imgs.map(img => {
      let contents = fs.readFileSync(base + img.src);
      return new File({
        cwd: './',
        base: './',
        path: img.src.replace(/^\//, ''),
        contents: contents
      })
    });

    files.forEach(file => this.push(file));
    callback(null);
  }
};

const _replace = function(replactor, options) {
  return function(file, enc, callback) {
    if (file.isNull()) {
      return callback(null, file);
    }

    let html = file.contents.toString();
    file.contents = new Buffer(replactor(html, options));
    callback(null, file);
  }
};

// 收集页面上的图片
module.exports.collect = (options) => {
  options = getOptions(options);
  return through2.obj(function(file, enc, callback) {
    return _collect(getPageImages, options).call(this, file, enc, callback);
  });
};

// 收集css样式表中的图片
module.exports.collectCSS = (options) => {
  options = getOptions(options);
  return through2.obj(function(file, enc, callback) {
    return _collect(getStyleImages, options).call(this, file, enc, callback);
  });
};

// 将页面上的图片适配webp版本
module.exports.replace = (options) => {
  options = getOptions(options);
  return through2.obj((file, enc, callback) => {
    return _replace(replace, options)(file, enc, callback);
  });
};

// 将css样式表中的图片适配webp版本
module.exports.replaceCSS = (options) => {
  options = getOptions(options);
  return through2.obj((file, enc, callback) => {
    return _replace(replaceCSS, options)(file, enc, callback);
  });
};
