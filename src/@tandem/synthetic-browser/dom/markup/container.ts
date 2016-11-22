import { DOMNodeType } from "./node-types";
import { SyntheticDOMNode, SyntheticDOMNodeEdit, SyntheticDOMNodeEditor } from "./node";
import { SyntheticDOMText } from "./text-node";
import { isDOMMutationEvent, DOMNodeEvent } from "@tandem/synthetic-browser/messages";
import {
  diffArray,
  ITreeWalker,
  findTreeNode,
  Mutation,
  RemoveMutation,
  TreeNode,
  MoveChildMutation,
  RemoveChildMutation,
  PropertyMutation,
  InsertChildMutation,
} from "@tandem/common";
import { getSelectorTester, ISelectorTester, querySelector, querySelectorAll } from "../selector";
import { SyntheticDOMElement } from "./element";
import {
  BaseEditor,
  IContentEdit,
  BaseContentEdit,
  ISyntheticObject,
} from "@tandem/sandbox";

export namespace SyntheticDOMContainerMutationTypes {
  export const INSERT_CHILD_NODE_EDIT = "insertChildNodeEdit";
  export const REMOVE_CHILD_NODE_EDIT = "removeChildNodeEdit";
  export const MOVE_CHILD_NODE_EDIT   = "moveChildNodeEdit";
}

export class SyntheticDOMContainerEdit<T extends SyntheticDOMContainer> extends SyntheticDOMNodeEdit<T> {

  insertChild(newChild: SyntheticDOMNode, index: number) {

    // Clone child here to freeze it from any changes. It WILL be cloned again, but that's also important to ensure
    // that this edit can be applied to multiple targets.
    return this.addChange(new InsertChildMutation(SyntheticDOMContainerMutationTypes.INSERT_CHILD_NODE_EDIT, this.target, newChild.cloneNode(true), index));
  }

  removeChild(child: SyntheticDOMNode) {
    return this.addChange(new RemoveChildMutation(SyntheticDOMContainerMutationTypes.REMOVE_CHILD_NODE_EDIT, this.target, child));
  }

  moveChild(child: SyntheticDOMNode, index: number) {
    return this.addChange(new MoveChildMutation(SyntheticDOMContainerMutationTypes.MOVE_CHILD_NODE_EDIT, this.target, child, index));
  }

  appendChild(newChild: SyntheticDOMNode) {
    return this.insertChild(newChild, Infinity);
  }

  remove() {
    return this.addChange(new RemoveMutation(this.target));
  }

  protected addDiff(newContainer: SyntheticDOMContainer) {
    diffArray(this.target.childNodes, newContainer.childNodes, (oldNode, newNode) => {
      if (oldNode.nodeName !== newNode.nodeName) return -1;
      return 0;
    }).accept({
      visitInsert: ({ index, value }) => {
        this.insertChild(value, index);
      },
      visitRemove: ({ index }) => {
        this.removeChild(this.target.childNodes[index]);
      },
      visitUpdate: ({ originalOldIndex, patchedOldIndex, newValue, index }) => {
        if (patchedOldIndex !== index) {
          this.moveChild(this.target.childNodes[originalOldIndex], index);
        }
        const oldValue = this.target.childNodes[originalOldIndex];
        this.addChildEdit(oldValue.createEdit().fromDiff(newValue));
      }
    });
    return super.addDiff(newContainer as T);
  }
}

export class DOMContainerEditor<T extends SyntheticDOMContainer|Element|Document|DocumentFragment> extends BaseEditor<T> {
  constructor(readonly target: T, readonly findChild: (parent: T, child: any) => any, readonly createNode:(source: any) => any = (source) => source.cloneNode(true)) {
    super(target);
  }

  applySingleMutation(mutation: Mutation<any>) {
    if (mutation.type === SyntheticDOMContainerMutationTypes.REMOVE_CHILD_NODE_EDIT) {
      const removeMutation = <InsertChildMutation<any, SyntheticDOMNode>>mutation;
      (<Element>this.target).removeChild(this.findChild(this.target, removeMutation.child));
    } if (mutation.type === SyntheticDOMContainerMutationTypes.MOVE_CHILD_NODE_EDIT) {
      const moveMutation = <MoveChildMutation<any, SyntheticDOMNode>>mutation;
      this._insertChildAt(this.findChild(this.target, moveMutation.child), moveMutation.index);
    } else if (mutation.type === SyntheticDOMContainerMutationTypes.INSERT_CHILD_NODE_EDIT) {
      const insertMutation = <InsertChildMutation<SyntheticDOMElement, SyntheticDOMNode>>mutation;
      this._insertChildAt(this.createNode(insertMutation.child), insertMutation.index);
    }
  }

  private _insertChildAt(child: any, index: number) {
    if (index === this.target.childNodes.length) {
      (<SyntheticDOMContainer>this.target).appendChild(child);
    } else {
      const existingChild = this.target.childNodes[index] as Element;
      (<Element>this.target).insertBefore(child, existingChild);
    }
  }
}

export class SyntheticDOMContainerEditor<T extends SyntheticDOMContainer> extends BaseEditor<T> {
  applyMutations(mutations: Mutation<any>[]) {
    new DOMContainerEditor(<any>this.target, (container, matchChild) => {
      const index = container.childNodes.findIndex(child => child.uid === matchChild.uid);
    }).applyMutations(mutations);
    new SyntheticDOMNodeEditor(<SyntheticDOMContainer>this.target).applyMutations(mutations);
  }
}

export abstract class SyntheticDOMContainer extends SyntheticDOMNode {

  createEdit(): SyntheticDOMContainerEdit<any> {
    return new SyntheticDOMContainerEdit(this);
  }

  getChildSyntheticByUID(uid): ISyntheticObject {
    return findTreeNode(this, child => child.uid === uid);
  }

  // TODO - insertBefore here
  appendChild(child: SyntheticDOMNode) {
    if (child.nodeType === DOMNodeType.DOCUMENT_FRAGMENT) {
      return child.children.concat().forEach((child) => this.appendChild(child));
    }
    return super.appendChild(child);
  }

  get textContent() {
    return this.childNodes.map(child => child.textContent).join("");
  }

  set textContent(value) {
    this.removeAllChildren();
    this.appendChild(this.ownerDocument.createTextNode(value));
  }

  toString() {
    return this.childNodes.map(child => child.toString()).join("");
  }

  public querySelector(selector: string): SyntheticDOMElement {
    return querySelector(this, selector);
  }

  public querySelectorAll(selector: string): SyntheticDOMElement[] {
    return querySelectorAll(this, selector);
  }

  createEditor() {
    return new SyntheticDOMContainerEditor(this);
  }

  visitWalker(walker: ITreeWalker) {
    this.childNodes.forEach(child => walker.accept(child));
  }
}

function isShadowRootOrDocument(node: SyntheticDOMNode) {
  return (node.nodeType === DOMNodeType.DOCUMENT_FRAGMENT || node.nodeType === DOMNodeType.DOCUMENT);
}