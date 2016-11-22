import {
  ISerializer,
  Mutation,
  serialize,
  deserialize,
  PropertyMutation,
  ITreeWalker,
  sourcePositionEquals
} from "@tandem/common";
import { SyntheticCSSStyleSheet } from "./style-sheet";
import { SyntheticDOMNode } from "@tandem/synthetic-browser/dom";
import {
  IEditable,
  BaseContentEdit,
  SyntheticObjectEdit,
  ISyntheticObject,
  ISyntheticSourceInfo,
  generateSyntheticUID,
  syntheticSourceInfoEquals,
  SyntheticObjectSerializer,
} from "@tandem/sandbox";

export class SyntheticCSSObjectEdit<T extends SyntheticCSSObject> extends SyntheticObjectEdit<T> {
}


export abstract class SyntheticCSSObject implements ISyntheticObject, IEditable {

  public $source: ISyntheticSourceInfo;
  public $uid: any;
  public $parentStyleSheet: SyntheticCSSStyleSheet;
  public $parentRule: SyntheticCSSObject;
  public $ownerNode: SyntheticDOMNode;

  constructor() {
    this.$uid = generateSyntheticUID();
  }

  get parentStyleSheet() {
    return this.$parentStyleSheet || this.$parentRule && this.$parentRule.parentStyleSheet;
  }

  get ownerNode() {
    return this.$ownerNode || this.$parentRule && this.$parentRule.ownerNode || this.$parentStyleSheet && this.$parentStyleSheet.ownerNode;
  }

  get parentRule() {
    return this.$parentRule;
  }

  get uid() {
    return this.$uid;
  }

  get source() {
    return this.$source;
  }

  clone(deep?: boolean) {
    if (deep) return deserialize(serialize(this), null);
    return this.$linkClone(this.cloneShallow());
  }

  public $linkClone(clone: SyntheticCSSObject) {
    clone.$source = this.$source;
    clone.$uid    = this.$uid;
    return clone;
  }

  protected abstract cloneShallow();
  abstract createEdit(): BaseContentEdit<SyntheticCSSObject>;
  applyMutation(change: Mutation<any>) {
    if (change.type === SyntheticObjectEdit.SET_SYNTHETIC_SOURCE_EDIT) {
      (<PropertyMutation<any>>change).applyTo(this);
    }
  }
  abstract visitWalker(walker: ITreeWalker);

  /**
   * Counts attribute differences of the target node, omitting children diffs.
   *
   * @abstract
   * @param {*} target
   * @param {boolean} [deep]
   */

  abstract countShallowDiffs(target: SyntheticCSSObject): number;
}

export const SyntheticCSSObjectSerializer = SyntheticObjectSerializer;