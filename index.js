/**
 * 搜寻页面中的img标签图片，适配webp格式图片
 * 适配后的img标签是懒加载模式
 * 1. 适配前：<img src="/assets/images/test.png">
 * 2. 适配后：<img class="j-webp" data-src="/assets/images/test.png" data-webp-src="/assets/images/test.webp">
 * 支持指定私有属性`_nowebp`来跳过适配，如：
 * <img src="/assets/images/demo.png" _nowebp>
 * @author luoying
 */

'use strict';

const through2 = require('through2');

// 搜索img标签
const REG_IMG = /<img.*\s+src=["|']([^"']+)["|'][^>]*>/gi;
// 匹配className属性
const REG_CLASSNAME = /class=["|']([^"']+)["|']/i;
// 匹配img标签闭合符号
const REG_CLOSETAG = /(\/?>)$/;

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

const replace = (html, options) => {
  let types = options.imageTypes.split(',').join('|');
  let matchs = getMatchs(html, REG_IMG);

  matchs.forEach(match => {
    let img = match[0];
    // 包含忽略私有属性的img标签，略过
    if (img.indexOf(options.ignoreAttr) >= 0) return;

    let src = match[1];
    // 当图片不符合指定的图片类型，略过
    if (!isSpecialType(src, types)) return;

    // 替换src为data-src，懒加载模式
    img = img.replace('src=', 'data-src=');

    // 得出同名不同后缀的webp图片url
    let webpSrc = src.replace(new RegExp(`\\.(${types})$`, 'i'), '.webp');
    // data-webp-src附加在img最后
    img = img.replace(REG_CLOSETAG, ` data-webp-src="${webpSrc}"$1`);

    let className = getClassName(img);
    // 加上指定className标识，以便业务脚本能够检测是否加载webp图片
    if (className.indexOf(options.className) === -1) {
      className += (className ? ' ' : '') + options.className;
      img = replaceClassName(img, className);
    }

    html = html.replace(match[0], img);
  });

  return html;
};

module.exports = (options) => {
  options = Object.assign({
    className: 'j-webp',
    imageTypes: 'jpg,jpeg,png',
    ignoreAttr: '_nowebp'
  }, options || {});
  return through2.obj((file, enc, callback) => {
    if (file.isNull()) {
      return callback(null, file);
    }

    let html = file.contents.toString();
    file.contents = new Buffer(replace(html, options));
    callback(null, file);
  });
};
