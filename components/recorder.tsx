import {
    ATTR_MAP,
    AttributeRecordItem,
    CLASS_TYPE, ClickRecordItem, CTAInfo, HighlightRecordItem,
    DeleteNodeRecordItem, EndRecordItem,
    MouseMoveRecordItem,
    NewNodeRecordItem,
    RecordItem,
    RootEmitMetaInfo,
    ScrollRecordItem,
    SNAPSHOT_ATTR_MAP,
    SnapshotNode,
    TextDataRecordItem,
    UBM_CLASS_PREFIX, NormalSemantics,
} from './interface';
import {isElementVisible, recordToStr} from './ubm-utils';
import _throttle from 'lodash/throttle';

const {slice} = Array.prototype;

export interface RequiredOptions {
    onRootEmitted: (root: SnapshotNode, metaInfo: RootEmitMetaInfo) => Promise<void>;
    onRecordItemsEmitted: (recordItems: RecordItem[]) => void;
    onStopped: () => void;
}

const defaultOptions = {
    scrollThrottle: 100,
    mousemoveThrottle: 100,
    bufferSize: 100,
    maxEmitSize: 500,
    debugMode: false,
};

export interface LifeCycleMonitors {
    beforeRecordHandle?: (record: MutationRecord) => any;
    onHandleRecord?: (record: MutationRecord, items: RecordItem[]) => any;
    onNodeBeingWalked?: (node: Node) => any;
    afterNodeWalked?: (node: Node, snapshotNode: SnapshotNode, isNew: boolean) => any;
}

export type UBMOptions = RequiredOptions & Partial<typeof defaultOptions> & LifeCycleMonitors;

export default class UserBehaviorRecorder {
    private nodeId = 1;
    private recordId = 0;
    private isReady = false;

    // we don't use WeakMap here since Node might be accessed after deletion
    private mapping = new Map<Node, { parentEle: HTMLElement; snapshotNode: SnapshotNode }>();
    private mutationObserver!: MutationObserver;
    private buffer: RecordItem[] = [];
    private root: SnapshotNode | undefined;
    // @ts-ignore
    private baseTimestamp: number;

    private options!: UBMOptions;

    constructor() {
    }

    init(options: UBMOptions) {
        this.options = Object.assign(defaultOptions, options);
    }


    private static isIgnoredNode(node: Node) {
        return node instanceof DocumentType || node instanceof HTMLMetaElement
            || node instanceof HTMLScriptElement || node instanceof Comment;
    }

    private ensureElement(ele: Node, hint: 'normal' | 'parent' | 'scroll', record?: MutationRecord, isDeletionCase = false) {
        const target = this.mapping.get(ele);
        if (!target) {
            if (ele instanceof HTMLElement && !isElementVisible(ele)) {
                console.warn(`The ${hint} target is not visible and might have been deleted from dom and garbage collected\n:${recordToStr(record)}`);
            } else if (!ele) {
                console.warn(`The ${hint} target is null/undefined, will ignore this`);
            } else if (!isDeletionCase) {
                console.error(`The ${hint} target might have been deleted,this might be a bug`, record);
            } else {
                console.warn(`The ${hint} target might have been deleted from dom and garbage collected\n:${recordToStr(record)}`);
            }
            return null;
        }
        return target;
    }

    private ensureId(ele: Node, hint: 'normal' | 'parent' | 'scroll', record?: MutationRecord, isDeletionCase = false) {
        const target = this.ensureElement(ele, hint, record, isDeletionCase);
        return target ? target.snapshotNode[SNAPSHOT_ATTR_MAP.ID] : null;
    }

    private ensureParentId(ele: Node, record: MutationRecord, isDeletionCase = false) {
        const target = this.ensureElement(ele, 'normal', record, isDeletionCase);
        if (!target) {
            return;
        }
        return this.ensureId(target.parentEle, 'parent', record);
    }

    private debug(...args: any[]) {
        if (this.options.debugMode) {
            console.debug(...args);
        }
    }

    private getDebugInfo(ele: HTMLElement) {
        if (this.options.debugMode) {
            if (!ele) {
                return {};
            }
            if (ele instanceof Text) {
                return {};
            }
            return {
                [ATTR_MAP.DEBUG_ID]: ele.getAttribute('id'),
                [ATTR_MAP.DEBUG_CLASS_NAME]: ele.className,
                [ATTR_MAP.DEBUG_PARENT_ID]: ele.parentElement && ele.parentElement.getAttribute('id'),
                [ATTR_MAP.DEBUG_PARENT_CLASSNAME]: ele.parentElement && ele.parentElement.className,
            };
        }
        return {};
    }

    private getNextRecordId(type: CLASS_TYPE) {
        const result = this.recordId;
        this.debug(`new id for ${type} ${result}`);
        this.recordId++;
        return result;
    }

    private handleRecord(record: MutationRecord) {
        const ts = Date.now() - this.baseTimestamp;
        this.options.beforeRecordHandle && this.options.beforeRecordHandle(record);
        const candidateItems: RecordItem[] = [];
        if (record.type === 'characterData') {
            if (UserBehaviorRecorder.isIgnoredNode(record.target)) {
                return;
            }
            const tid = this.ensureId(record.target, 'normal', record);
            const pid = this.ensureId(record.target.parentElement!, 'parent', record);
            if (tid && pid) {
                candidateItems.push({
                    [ATTR_MAP.RID]: this.getNextRecordId(CLASS_TYPE.DATA),
                    [ATTR_MAP.CLASS]: CLASS_TYPE.DATA,
                    [ATTR_MAP.TID]: tid,
                    [ATTR_MAP.PID]: pid,
                    [ATTR_MAP.TS]: ts,
                    [ATTR_MAP.DATA]: (record.target as Text).data,
                } as TextDataRecordItem);
            }
        } else if (record.type === 'attributes') {
            if (UserBehaviorRecorder.isIgnoredNode(record.target)) {
                return;
            }
            const tid = this.ensureId(record.target, 'normal', record);
            if (tid && record.target instanceof Element) {
                const key = record.attributeName!;
                let value = (record.target as HTMLElement).getAttribute(key);
                // make sure class attribute is carried on
                if (key === 'class') {
                    const className = UBM_CLASS_PREFIX + tid;
                    if (value && value.indexOf(className) === -1) {
                        value += ` ${className}`;
                        UserBehaviorRecorder.addUBMClass(record.target, tid);
                    }
                }
                candidateItems.push({
                    [ATTR_MAP.RID]: this.getNextRecordId(CLASS_TYPE.ATTR),
                    ...this.getDebugInfo(record.target as any),
                    [ATTR_MAP.CLASS]: CLASS_TYPE.ATTR,
                    [ATTR_MAP.TID]: tid,
                    [ATTR_MAP.TS]: ts,
                    [ATTR_MAP.KEY]: key,
                    [ATTR_MAP.VALUE]: value,
                } as AttributeRecordItem);
            }
        } else if (record.type === 'childList') {
            if (record.removedNodes && record.removedNodes.length > 0) {
                record.removedNodes.forEach((n) => {
                    if (UserBehaviorRecorder.isIgnoredNode(n)) {
                        return;
                    }

                    const tid = this.ensureId(n, 'normal', record, true);

                    // hacky case check, the removed node still exists in the dom
                    // cannot figure out the reason for now
                    const ubmClass = UBM_CLASS_PREFIX + tid;
                    const eles = document.getElementsByClassName(ubmClass);
                    if (eles.length > 0) {
                        console.warn('The removed element is still in the Dom Tree, check your recording to see if everything is still ok, we will remove it ', ubmClass, eles, record);
                        return;
                    }

                    // the reference of parentElement can be lost for deleted elements, so let us
                    // take this from our mapping
                    const pid = this.ensureParentId(n, record, true);
                    if (tid && pid) {
                        candidateItems.push(
                            {
                                [ATTR_MAP.RID]: this.getNextRecordId(CLASS_TYPE.RM),
                                [ATTR_MAP.CLASS]: CLASS_TYPE.RM,
                                ...this.getDebugInfo(n as any),
                                [ATTR_MAP.TID]: tid,
                                [ATTR_MAP.PID]: pid,
                                [ATTR_MAP.TS]: ts,
                                [ATTR_MAP.DELETED_DATA]: n instanceof Text ? n.data : null,
                            } as DeleteNodeRecordItem,
                        );
                    }
                });
            }
            if (record.addedNodes && record.addedNodes.length > 0) {
                record.addedNodes.forEach((n) => {
                    if (UserBehaviorRecorder.isIgnoredNode(n)) {
                        return;
                    }
                    const pid = this.ensureId(n.parentElement!, 'parent', record);
                    if (!pid) {
                        return;
                    }
                    const {
                        snapshotNode,
                        alreadyWalked,
                    } = this.walk(null, n)!;
                    // important! already walked nodes should not be re-added
                    if (alreadyWalked) {
                        return;
                    }
                    candidateItems.push(
                        {
                            ...this.getDebugInfo(n as any),
                            [ATTR_MAP.RID]: this.getNextRecordId(CLASS_TYPE.NEW),
                            [ATTR_MAP.CLASS]: CLASS_TYPE.NEW,
                            [ATTR_MAP.TID]: snapshotNode[SNAPSHOT_ATTR_MAP.ID]!,
                            [ATTR_MAP.TS]: ts,
                            [ATTR_MAP.PID]: pid,
                            // if siblings do not exist in the dom now, ignore this information
                            // since when playing we will also not be able to find them,
                            transientPrevNode: !this.mapping.has(n.previousSibling!) || !n.previousSibling || UserBehaviorRecorder.isIgnoredNode(n.previousSibling) ? null : n.previousSibling,
                            transientNextNode: !this.mapping.has(n.nextSibling!) || !n.nextSibling || UserBehaviorRecorder.isIgnoredNode(n.nextSibling) ? null : n.nextSibling,
                            [ATTR_MAP.NEW_SNAPSHOT_NODE]: snapshotNode,
                        } as NewNodeRecordItem,
                    );
                });
            }
        }
        if (candidateItems.length > 0) {
            this.options.onHandleRecord && this.options.onHandleRecord(record, candidateItems);
            this.push(candidateItems);
        }
    }

    private push(records: RecordItem[]) {
        this.buffer.push(...records);
    }

    private scrollHandler!: (e: Event) => void;

    private mouseMoveHandler!: (e: MouseEvent) => void;

    private clickHandler!: (e: MouseEvent) => void;

    private restore() {
        this.mapping.clear();
        this.recordId = 0;
        this.buffer = [];
        this.root = undefined;
        this.baseTimestamp = +Date.now();
        this.isReady = false;
        this.unregisterEvent();
    }

    private registerEvents() {
        this.scrollHandler = _throttle((e) => {
            let target = e.target as HTMLElement;
            console.log(target);
            if (target instanceof HTMLDocument) {
                target = document.documentElement;
            }
            const snapshot = this.ensureElement(target, 'scroll');
            if (snapshot && snapshot.snapshotNode[SNAPSHOT_ATTR_MAP.ID]) {
                const record = {
                    [ATTR_MAP.RID]: this.getNextRecordId(CLASS_TYPE.SCROLL),
                    [ATTR_MAP.CLASS]: CLASS_TYPE.SCROLL,
                    [ATTR_MAP.TS]: Date.now() - this.baseTimestamp,
                    [ATTR_MAP.TID]: snapshot.snapshotNode[SNAPSHOT_ATTR_MAP.ID],
                    [ATTR_MAP.TOP]: target.scrollTop,
                    [ATTR_MAP.LEFT]: target.scrollLeft,
                } as ScrollRecordItem;
                this.push([record]);
                this.streamRecords(false);
            }
        }, this.options.scrollThrottle!);
        window.addEventListener('scroll', this.scrollHandler, true);

        this.mouseMoveHandler = _throttle((e: MouseEvent) => {
            const recordItem: MouseMoveRecordItem = {
                [ATTR_MAP.RID]: this.getNextRecordId(CLASS_TYPE.MOUSEMOVE),
                [ATTR_MAP.TS]: Date.now() - this.baseTimestamp,
                [ATTR_MAP.CLASS]: CLASS_TYPE.MOUSEMOVE,
                [ATTR_MAP.LEFT]: e.clientX,
                [ATTR_MAP.TOP]: e.clientY,
            };
            this.push([recordItem]);
            this.streamRecords(false);
        }, this.options.mousemoveThrottle!);
        window.addEventListener('mousemove', this.mouseMoveHandler, true);

        this.clickHandler = (e: MouseEvent) => {
            const recordItem: ClickRecordItem = {
                [ATTR_MAP.RID]: this.getNextRecordId(CLASS_TYPE.CLICK),
                [ATTR_MAP.TS]: Date.now() - this.baseTimestamp,
                [ATTR_MAP.CLASS]: CLASS_TYPE.CLICK,
                [ATTR_MAP.LEFT]: e.clientX,
                [ATTR_MAP.TOP]: e.clientY,
            };
            this.push([recordItem]);
            this.streamRecords(false);
        };
        window.addEventListener('click', this.clickHandler, true);
    }

    private unregisterEvent() {
        window.removeEventListener('scroll', this.scrollHandler, true);
        window.removeEventListener('mousemove', this.mouseMoveHandler, true);
        window.removeEventListener('click', this.clickHandler, true);
    }

    private lastUrl!: string;

    private checkUrlChange() {
        if (this.lastUrl !== document.URL) {
            const record: HighlightRecordItem = {
                [ATTR_MAP.CLASS]: CLASS_TYPE.HIGHLIGHT,
                [ATTR_MAP.RID]: this.getNextRecordId(CLASS_TYPE.HIGHLIGHT),
                [ATTR_MAP.TS]: Date.now() - this.baseTimestamp,
                [ATTR_MAP.HIGHLIGHT_SEMANTIC]: NormalSemantics.URL,
                [ATTR_MAP.HIGHLIGHT_DESCRIPTION]: document.URL,
            }
            this.lastUrl = document.URL;
            this.push([record]);
        }
    }

    private observeMutations() {
        this.lastUrl = document.URL;
        this.mutationObserver = new MutationObserver((records) => {
            this.checkUrlChange();
            for (let i = 0; i < records.length; i++) {
                // see evidence/too_many_records.png
                this.handleRecord(records[i]);
            }
            this.streamRecords(false);
        });
        this.mutationObserver.observe(document, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true,
            attributeOldValue: true,
        });
    }

    private static addUBMClass(node: Node, ubmId: number) {
        if (node instanceof Element) {
            const {classList} = node as Element;
            const ubmClass = UBM_CLASS_PREFIX + ubmId;
            if (classList && !classList.contains(ubmClass)) {
                classList.add(ubmClass);
            }
        }
    }

    private getAttributes(ele: Element) {
        const result: SnapshotNode[SNAPSHOT_ATTR_MAP.ATTR] = {};
        const attrNames = ele.getAttributeNames();
        attrNames.forEach((attr: string) => {
            let value = ele.getAttribute(attr)!;
            // handle resource normalization
            if (attr === 'src' || attr === 'href') {
                this.debug(`try handling src/href ${attr}->${value}`);
                // below we try to normalize url
                // base 64
                if (value.indexOf('data:') !== -1) {
                    // do nothing
                } else if (value.indexOf('//') === 0) {
                    // eslint-disable-next-line no-restricted-globals
                    value = location.protocol + value;
                } else if (value.indexOf('http') === -1) {
                    if (value[0] === '/') {
                        value = window.origin + value;
                    } else {
                        value = `${window.origin}/${value}`;
                    }
                }
                this.debug(`After being processed: ${attr}->${value}`);
            }
            result[attr] = value;
        });
        return result;
    }

    private static getTagName(node:
                                  Node) {
        if (node instanceof Text) {
            return 'TEXT';
        } else if (node instanceof Document) {
            return 'DOCUMENT';
        } else if (node instanceof HTMLElement || node instanceof SVGElement) {
            return node.tagName;
        }
        throw new Error(`Unknown node ${node}`);
    }

    private walk(parentChildList:
                     SnapshotNode[] | null, node:
                     Node): { snapshotNode: SnapshotNode; alreadyWalked: boolean } | null {
        this.options.onNodeBeingWalked && this.options.onNodeBeingWalked(node);
        if (UserBehaviorRecorder.isIgnoredNode(node)) {
            return null;
        }
        if (this.mapping.has(node)) {
            const {snapshotNode} = this.mapping.get(node)!;
            this.debug(`${snapshotNode[SNAPSHOT_ATTR_MAP.ID]} has already been walked, will skip this`);
            this.options.afterNodeWalked && this.options.afterNodeWalked(node, snapshotNode, false);
            return {
                snapshotNode,
                alreadyWalked: true,
            };
        }
        const isText = node instanceof Text;

        const newNode = {
            [SNAPSHOT_ATTR_MAP.ID]: this.nodeId++,
            [SNAPSHOT_ATTR_MAP.TAG_NAME]: UserBehaviorRecorder.getTagName(node),
            [SNAPSHOT_ATTR_MAP.IS_SVG]: node instanceof SVGElement, // is svg?, svg tag needs namespace when creating, so we treat it differently
            [SNAPSHOT_ATTR_MAP.TEXT_DATA]: isText ? (node as Text).data : '',
            [SNAPSHOT_ATTR_MAP.ATTR]: node instanceof Element ? this.getAttributes(node) : null,
            [SNAPSHOT_ATTR_MAP.CHILDREN]: [],
        } as SnapshotNode;

        if (!isText) {
            UserBehaviorRecorder.addUBMClass(node, newNode[SNAPSHOT_ATTR_MAP.ID]);
        }
        this.mapping.set(node, {
            // save parent node reference in case node is deleted
            parentEle: node.parentElement!,
            snapshotNode: newNode,
        });
        if (parentChildList) {
            parentChildList.push(newNode);
        }
        if (!isText) {
            const childNodes = slice.call(node.childNodes);
            childNodes.forEach((c) => {
                this.walk(newNode[SNAPSHOT_ATTR_MAP.CHILDREN], c);
            });
        }
        this.options.afterNodeWalked && this.options.afterNodeWalked(node, newNode, true);
        return {
            snapshotNode: newNode,
            alreadyWalked: false,
        };
    }


    takeSnapshot() {
        this.root = this.walk(null, document)!.snapshotNode;
    }

    record() {
        this.restore();
        this.takeSnapshot()
        this.registerEvents();
        this.observeMutations();
        this.options.onRootEmitted(this.root!, {baseTimestamp: this.baseTimestamp})
            .then(() => {
                this.isReady = true;
            })
            .catch(e => {
                console.error("Failed to upload root.json, will skip recording");
                this.stop();
            })
    }

    public addCustomRecordItem(item: CTAInfo) {
        const record: HighlightRecordItem = {
            [ATTR_MAP.RID]: this.getNextRecordId(CLASS_TYPE.HIGHLIGHT),
            [ATTR_MAP.TS]: Date.now() - this.baseTimestamp,
            [ATTR_MAP.CLASS]: CLASS_TYPE.HIGHLIGHT,
            [ATTR_MAP.HIGHLIGHT_SEMANTIC]: item.semantic,
            [ATTR_MAP.HIGHLIGHT_DESCRIPTION]: item.description,
        }
        this.push([record]);
    }

    // try to flush records so that invoker program can receive record items as a stream
    // if the node has prev or next siblings while these siblings are not in the dom tree.
    // the .ne and .pr attribute cannot be resolved,
    // so the program will skip emitting resolved records in the current round and try again in the later rounds.
    private lastHandledIndex = 0;

    streamRecords(isLastBatch: boolean) {
        // eslint-disable-next-line no-restricted-syntax
        for (let i = this.lastHandledIndex; i < this.buffer.length; i++) {
            const r = this.buffer[i];
            if (r[ATTR_MAP.CLASS] === CLASS_TYPE.NEW) {
                const rr = r as NewNodeRecordItem;
                if (rr.transientPrevNode) {
                    const item = this.mapping.get(rr.transientPrevNode);
                    if (!item) {
                        if (isLastBatch) {
                            console.error('Potential bug: Cannot find ubm id for transient prev element when flushing in the last round, record is ', rr);
                        } else {
                            this.debug('Cannot resolve prevNode', rr, ' will try in the next flush');
                            return;
                        }
                    } else {
                        rr.pr = item.snapshotNode[SNAPSHOT_ATTR_MAP.ID];
                    }
                    // @ts-ignore
                    delete rr.transientPrevNode;
                } else if (rr.transientPrevNode === null) {
                    // @ts-ignore
                    delete rr.transientPrevNode;
                }
                if (rr.transientNextNode) {
                    const item = this.mapping.get(rr.transientNextNode);
                    if (!item) {
                        if (isLastBatch) {
                            console.error('Potential bug: Cannot find ubm id for transient next element when flushing in the last round, record is ', rr);
                        } else {
                            this.debug('Cannot resolve nextNode', rr, ' will try in the next flush');
                            return;
                        }
                    } else {
                        rr.ne = item.snapshotNode[SNAPSHOT_ATTR_MAP.ID];
                    }
                    // @ts-ignore
                    delete rr.transientNextNode;
                } else if (rr.transientNextNode === null) {
                    // @ts-ignore
                    delete rr.transientNextNode;
                }
            }
            this.lastHandledIndex++;
        }
        const bufferSize = this.options.bufferSize || 100;
        const currentContentLength = this.buffer.length;
        if ((currentContentLength >= bufferSize || isLastBatch) && this.isReady) {
            const sendTask = this.buffer;
            // empty out the current buffer so that memory leak does not occur.
            this.buffer = [];
            this.lastHandledIndex = 0;

            // the currentContentLength can be extremely big, see evidence/too_many_records.png
            const maxEmitSize = this.options.maxEmitSize || 500;
            const times = Math.ceil(sendTask.length / maxEmitSize);
            for (let i = 0; i < times; i++) {
                const start = maxEmitSize * i;
                const end = Math.min(maxEmitSize * (i + 1), sendTask.length);
                const batch = sendTask.slice(start, end);
                this.options.onRecordItemsEmitted(batch);
            }
        }
    }

    stop() {
        if (this.mutationObserver && this.root) {
            this.mutationObserver.disconnect();
            const records = this.mutationObserver.takeRecords();
            records.forEach(this.handleRecord.bind(this));
            const endRecord = {
                [ATTR_MAP.RID]: this.getNextRecordId(CLASS_TYPE.END),
                [ATTR_MAP.CLASS]: CLASS_TYPE.END,
                [ATTR_MAP.TS]: Date.now() - this.baseTimestamp,
            } as EndRecordItem;
            this.push([endRecord]);
            this.streamRecords(true);
        }
        this.options.onStopped();
        this.restore();
    }
}
