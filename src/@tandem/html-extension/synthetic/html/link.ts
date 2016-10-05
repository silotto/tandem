import { Action } from "@tandem/common/actions";
import { MimeTypes } from "@tandem/common/constants";
import {
  SyntheticHTMLElement,
  SyntheticCSSStyleSheet,
  SyntheticHTMLElementClassDependency,
} from "@tandem/synthetic-browser";

export class SyntheticHTMLLink extends SyntheticHTMLElement {
  private _styleSheet: SyntheticCSSStyleSheet;
  async loadLeaf() {
    const window = this.ownerDocument.defaultView;
    const href    = this.getAttribute("href");
    const exports = await window.sandbox.importer.import(MimeTypes.HTML, href, window.location.toString());
    this.notify(new Action("loaded"));
  }
  get outerHTML() {
    return "";
  }
}

export const syntheticHTMLLinkClassDependency = new SyntheticHTMLElementClassDependency("link", SyntheticHTMLLink);