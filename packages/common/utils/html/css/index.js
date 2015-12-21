export { default as parseUnit } from './parse-units';
import { CSSTokenizer } from 'common/components/text-editor';

/**
* calculates the correct zoom of an element
*/

export function calculateZoom(element) {
  var current = element;
  var zoom    = 1;

  while (current && current.style) {
    if (current.style.zoom !== '') {
      zoom *= Number(current.style.zoom);
    }
    current = current.parentNode;
  }

  return zoom;
}

export function stringifyToken(token) {
  return token.value;
}

var tok = CSSTokenizer.create();

export function tokenize(source) {
  return tok.tokenize(String(source || ''));
}

export function translateLength(x1, y1, x2) {

  var tokens = tokenize(y1);

  var left   = tokens.find(function(token) {
    return /number/.test(token.type);
  });


  if (left) {
    left.value = Number(((left.value * x2) / x1).toFixed(2));
  }

  var ret = tokens.map(stringifyToken).join('');

  return ret;
}

export { default as convertUnit } from './convert-unit';
