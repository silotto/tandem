/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
var assert = require("assert");
var vscode_languageserver_types_1 = require("vscode-languageserver-types");
var htmlParser_1 = require("../parser/htmlParser");
var htmlHighlighting_1 = require("../services/htmlHighlighting");
suite('HTML Highlighting', function () {
    function assertHighlights(value, expectedMatches, elementName) {
        var offset = value.indexOf('|');
        value = value.substr(0, offset) + value.substr(offset + 1);
        var document = vscode_languageserver_types_1.TextDocument.create('test://test/test.html', 'html', 0, value);
        var position = document.positionAt(offset);
        var htmlDoc = htmlParser_1.parseHTMLDocument(document);
        var highlights = htmlHighlighting_1.findDocumentHighlights(document, position, htmlDoc);
        assert.equal(highlights.length, expectedMatches.length);
        for (var i = 0; i < highlights.length; i++) {
            var actualStartOffset = document.offsetAt(highlights[i].range.start);
            assert.equal(actualStartOffset, expectedMatches[i]);
            var actualEndOffset = document.offsetAt(highlights[i].range.end);
            assert.equal(actualEndOffset, expectedMatches[i] + elementName.length);
            assert.equal(document
                .getText()
                .substring(actualStartOffset, actualEndOffset)
                .toLowerCase(), elementName);
        }
    }
    test('Single', function () {
        assertHighlights('|<html></html>', [], null);
        assertHighlights('<|html></html>', [1, 8], 'html');
        assertHighlights('<h|tml></html>', [1, 8], 'html');
        assertHighlights('<htm|l></html>', [1, 8], 'html');
        assertHighlights('<html|></html>', [1, 8], 'html');
        assertHighlights('<html>|</html>', [], null);
        assertHighlights('<html><|/html>', [], null);
        assertHighlights('<html></|html>', [1, 8], 'html');
        assertHighlights('<html></h|tml>', [1, 8], 'html');
        assertHighlights('<html></ht|ml>', [1, 8], 'html');
        assertHighlights('<html></htm|l>', [1, 8], 'html');
        assertHighlights('<html></html|>', [1, 8], 'html');
        assertHighlights('<html></html>|', [], null);
    });
    test('Nested', function () {
        assertHighlights('<html>|<div></div></html>', [], null);
        assertHighlights('<html><|div></div></html>', [7, 13], 'div');
        assertHighlights('<html><div>|</div></html>', [], null);
        assertHighlights('<html><div></di|v></html>', [7, 13], 'div');
        assertHighlights('<html><div><div></div></di|v></html>', [7, 24], 'div');
        assertHighlights('<html><div><div></div|></div></html>', [12, 18], 'div');
        assertHighlights('<html><div><div|></div></div></html>', [12, 18], 'div');
        assertHighlights('<html><div><div></div></div></h|tml>', [1, 30], 'html');
        assertHighlights('<html><di|v></div><div></div></html>', [7, 13], 'div');
        assertHighlights('<html><div></div><div></d|iv></html>', [18, 24], 'div');
    });
    test('Selfclosed', function () {
        assertHighlights('<html><|div/></html>', [7], 'div');
        assertHighlights('<html><|br></html>', [7], 'br');
        assertHighlights('<html><div><d|iv/></div></html>', [12], 'div');
    });
    test('Case insensivity', function () {
        assertHighlights('<HTML><diV><Div></dIV></dI|v></html>', [7, 24], 'div');
        assertHighlights('<HTML><diV|><Div></dIV></dIv></html>', [7, 24], 'div');
    });
});
//# sourceMappingURL=highlighting.test.js.map