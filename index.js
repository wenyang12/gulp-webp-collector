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

// 匹配css资源，link外链或style内联样式
const REG_CSS = /(?:<link.*href=["|'](.+\.css)["|'].*\/?>|<style.*>([^<]*)<\/style>)/gi;
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

const replace = (html, options) => {
  let types = getTypes(options);
  let imgs = collect(html, options);
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

const collect = (html, options) => {
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

const collectCSS = (html, root, options) => {
  let imgs = [];
  let types = getTypes(options);
  let matchs = getMatchs(html, REG_CSS);

  matchs.forEach(match => {
    let url = match[1];
    let style = match[2]; // 内联样式
    let base = root;

    if (url) {
      let cssPath = root + url;
      base = path.dirname(cssPath);
      style = fs.readFileSync(cssPath, 'utf8');
    }

    if (!style) return;

    let assets = getMatchs(style, REG_CSS_ASSETS);
    assets.forEach(asset => {
      let src = asset[1];
      // 当图片不符合指定的图片类型，略过
      if (!isSpecialType(src, types)) return;
      imgs.push({
        tag: null,
        src: path.join(base, src).replace(root, '')
      });
    });
  });

  return imgs;
};

const getOptions = (options) => {
  return Object.assign({
    className: 'j-webp',
    imageTypes: 'jpg,jpeg,png',
    ignoreAttr: '_nowebp'
  }, options || {});
};

module.exports.collect = (options) => {
  options = getOptions(options);
  return through2.obj(function(file, enc, callback) {
    if (file.isNull()) {
      return callback(null, file);
    }

    let base = path.dirname(file.path);
    let html = file.contents.toString();
    let imgs = collect(html, options);
    imgs = imgs.concat(collectCSS(html, base, options));

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
  });
};

module.exports.replace = (options) => {
  options = getOptions(options);
  return through2.obj((file, enc, callback) => {
    if (file.isNull()) {
      return callback(null, file);
    }

    let html = file.contents.toString();
    file.contents = new Buffer(replace(html, options));
    callback(null, file);
  });
};
