import {
    ATTR_MAP,
    AttributeRecordItem,
    CLASS_TYPE,
    ClickRecordItem,
    DeleteNodeRecordItem,
    HighlightRecordItem,
    MouseMoveRecordItem,
    NewNodeRecordItem, NormalSemantics,
    RecordItem,
    ScrollRecordItem,
    SNAPSHOT_ATTR_MAP,
    SnapshotNode,
    SVG_NAMESPACE,
    TextDataRecordItem,
    UBM_CLASS_PREFIX,
    UBMPageResult,
    UMB_CLASS_REGEX,
} from './interface';
import {insertAfter, insertAsFirst, normalizePercentage} from './ubm-utils';
import {action, computed, makeObservable, observable, runInAction} from "mobx";

export interface UserBehaviorPlayerOptions {
    mountPoint: HTMLIFrameElement;
    debugMode?: boolean;
    onProgress?: (progress: number) => void;
    onPlayFinished?: () => void;
    onSeekingFinished?: () => void;
    onIframeDocumentObjectCreated?: (doc: Document) => void;
    trackerZIndex?: number;
}

export default class UserBehaviorPlayer {
    private static DEFAULT_OPTIONS = {
        debugMode: false,
        onPlayFinished: () => {
            console.debug(`The record was fully played`);
        },
        trackerZIndex: 999999,
    };

    private _isPaused = false;
    // is showing first scene or playing records
    private _isPlaying = false;
    // is play records, this is turned into true after the first scene is played
    private _isPlayingRecords = false;
    // where we are at
    private currentPlayIndex = 0;
    // where we target to go
    private seekingTargetIndex = -1;

    private records: RecordItem[] = [];
    private idToDomNode: Map<number, Node> = new Map<number, Node>();
    private lastRecordId = -1;
    private timeout = -1;
    // the ids that is already deleted
    private deletedId: Set<number> = new Set<number>();

    // for debugging usage;
    // key snapshot id, value parent id, -1 for root node's parent id
    private parentRef: Map<number, number> = new Map();
    private static ROOT_PARENT_ID = -1;

    private restoreState() {
        this.records = [];
        this.idToDomNode.clear();
        this.lastRecordId = -1;
        clearTimeout(this.timeout);
        clearTimeout(this.timerIdForHint);
        this.timeout = -1;
        this.deletedId.clear();
        this.parentRef.clear();
        this._isPaused = false;
        this._isPlaying = false;
        this._isPlayingRecords = false;
        this.seekingTargetIndex = -1;
        this.currentPlayIndex = 0;
    }

    get isPaused() {
        return this._isPaused;
    }

    get isPlaying() {
        return this._isPlaying;
    }

    get isPlayingRecords() {
        return this._isPlayingRecords;
    }

    get isSeekingModeOn() {
        return this.seekingTargetIndex !== -1;
    }

    get isSeeking() {
        return this.isSeekingModeOn && this.currentPlayIndex < this.seekingTargetIndex;
    }

    get progress() {
        if (!this.ubmPageResult) {
            return 0;
        }
        return normalizePercentage(this.currentPlayIndex, this.totalRecordCount);
    }

    get highlightRecords(): HighlightRecordItem[] {
        if (!this.ubmPageResult) {
            return [];
        }
        return this.ubmPageResult.recordItems
            .filter(r => r[ATTR_MAP.CLASS] === CLASS_TYPE.HIGHLIGHT) as HighlightRecordItem[];
    }

    get highlightSemantics(): string[] {
        const semantics = new Set<string>();
        this.highlightRecords.forEach(r => {
            if (UserBehaviorPlayer.isHighlightRecordItem(r)) {
                semantics.add(r[ATTR_MAP.HIGHLIGHT_SEMANTIC]);
            }
        });
        return [...semantics];
    }

    get totalRecordCount() {
        if (!this.ubmPageResult) {
            return 0;
        }
        return this.ubmPageResult.recordItems.length;
    }

    private options!: UserBehaviorPlayerOptions;

    public ubmPageResult!: UBMPageResult;

    init(ubmPageResult: UBMPageResult, options: UserBehaviorPlayerOptions) {
        runInAction(() => {
            this.ubmPageResult = ubmPageResult;
        });
        if (options) {
            this.options = Object.assign(UserBehaviorPlayer.DEFAULT_OPTIONS, options);
        }
    }

    constructor() {
        makeObservable(this, {
            // @ts-ignore
            _isPaused: observable,
            _isPlaying: observable,
            _isPlayingRecords: observable,
            currentPlayIndex: observable,
            seekingTargetIndex: observable,
            ubmPageResult: observable.ref,
            isPaused: computed,
            isPlaying: computed,
            isSeeking: computed,
            isPlayingRecords: computed,
            isSeekingModeOn: computed,
            progress: computed,
            highlightRecords: computed,
            highlightSemantics: computed,
            totalRecordCount: computed,
            restoreState: action,
        })
    }

    private speed = 1;

    setSpeed(speed: 1 | 2 | 3 | 4 | 5) {
        this.speed = speed;
    }

    getSpeed() {
        return this.speed;
    }

    private fastForwardThreshold = 2000;

    setFastForwardThreshold(val: number) {
        this.fastForwardThreshold = val;
    }

    getFastForwardThreshold() {
        return this.fastForwardThreshold;
    }

    private tasks!: RecordItem[];
    private mouseTracker!: HTMLDivElement;
    private clickTracker!: HTMLDivElement;
    private userFriendlyHint!: HTMLDivElement;

    private timerIdForHint = -1;
    private timerIdForClick = -1;

    private static isTextRecordItem(r: RecordItem): r is TextDataRecordItem {
        return r[ATTR_MAP.CLASS] === CLASS_TYPE.DATA;
    }

    private static isAttributeRecordItem(r: RecordItem): r is AttributeRecordItem {
        return r[ATTR_MAP.CLASS] === CLASS_TYPE.ATTR;
    }

    private static isNewNodeRecordItem(r: RecordItem): r is NewNodeRecordItem {
        return r[ATTR_MAP.CLASS] === CLASS_TYPE.NEW;
    }

    private static isDeleteNodeRecordItem(r: RecordItem): r is DeleteNodeRecordItem {
        return r[ATTR_MAP.CLASS] === CLASS_TYPE.RM;
    }

    private static isScrollRecordItem(r: RecordItem): r is ScrollRecordItem {
        return r[ATTR_MAP.CLASS] === CLASS_TYPE.SCROLL;
    }

    private static isMousePositionItem(r: RecordItem): r is MouseMoveRecordItem {
        return r[ATTR_MAP.CLASS] === CLASS_TYPE.MOUSEMOVE;
    }

    private static isClickRecordItem(r: RecordItem): r is ClickRecordItem {
        return r[ATTR_MAP.CLASS] === CLASS_TYPE.CLICK;
    }

    private static isHighlightRecordItem(r: RecordItem): r is HighlightRecordItem {
        return r[ATTR_MAP.CLASS] === CLASS_TYPE.HIGHLIGHT;
    }

    private checkAncestorIsAlreadyDeleted(nodeId: number, isTextDeleted: boolean, text?: string) {
        let id = nodeId;
        let level = 1;
        const path = [nodeId];
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const parentId = this.parentRef.get(id);
            if (!parentId) {
                if (isTextDeleted) {
                    console.warn(`weird, cannot find parent id,
                 path is ${path.toString()},
                 but this is a text, data is ${text}`);
                    return false;
                } else {
                    console.error(`weird, cannot find parent id,
                 path is ${path.toString()},
                 could be potential bug`);
                    return false;
                }
            }
            if (parentId === UserBehaviorPlayer.ROOT_PARENT_ID) {
                if (isTextDeleted) {
                    console.warn(`Root search reached, none of the ancestor was deleted but this element still cannot be found in DOM, 
                path is ${path.toString()},
                but this is a text, data is ${text}
                `);
                    return false;
                } else {
                    console.error(`Root search reached, none of the ancestor was deleted but this element still cannot be found in DOM, 
                path is ${path.toString()},
                could be potential bug`);
                    return false;
                }
            }
            if (this.deletedId.has(parentId)) {
                console.warn(`The ancestor element that is ${level} levels above was deleted before record ${nodeId}, so this should be ok`);
                return true;
            }
            id = parentId;
            path.push(parentId);
            level++;
        }
    }

    private getDomNode(id: number) {
        // return document.getElementsByClassName(UBM_CLASS_PREFIX + id)[0];
        return this.idToDomNode.get(id);
    }

    private ensureElement(id: number, hint: 'normal' | 'parent', record: RecordItem, checkParentIsDeleted = false) {
        const ele = this.getDomNode(id);
        if (!ele) {
            if (checkParentIsDeleted) {
                this.checkAncestorIsAlreadyDeleted(record[ATTR_MAP.TID]!, record[ATTR_MAP.CLASS] === CLASS_TYPE.RM && (record as DeleteNodeRecordItem)[ATTR_MAP.DELETED_DATA] !== null,
                    (record as any)[ATTR_MAP.DELETED_DATA]);
            } else {
                console.error(`Cannot find ${hint} ele for record ${record}`);
            }
            return null;
        }
        return ele;
    }

    private initMouseTracker(doc: HTMLDocument) {
        const id = 'ubm-mouse-tracker';
        let mouseTracker: HTMLDivElement = doc.getElementById(id) as HTMLDivElement;
        if (!mouseTracker) {
            mouseTracker = doc.createElement('div');
            mouseTracker.setAttribute('id', id);
        }
        const {style} = mouseTracker;
        style.position = 'fixed';
        style.zIndex = `${this.options.trackerZIndex}`;
        style.width = '15px';
        style.height = '15px';
        style.backgroundColor = 'red';
        style.borderRadius = '50%';
        style.left = '0px';
        style.top = '0px';
        this.mouseTracker = mouseTracker;
        doc.body.appendChild(mouseTracker);
    }

    private initClickTracker(doc: HTMLDocument) {
        const id = 'ubm-click-tracker';
        if (!doc.getElementById(id)) {
            const clickTracker = doc.createElement('div');
            clickTracker.setAttribute('id', id);
            const clickTrackerInner = doc.createElement('div');
            const {style} = clickTracker;
            const {style: style2} = clickTrackerInner;
            style.position = 'fixed';
            style.zIndex = `${this.options.trackerZIndex! + 1}`;
            style.width = '30px';
            style.height = '30px';
            style.border = '2px solid blue';
            style.backgroundColor = 'transparent';
            style.borderRadius = '50%';
            style.left = '0px';
            style.top = '0px';
            style.display = 'none';
            style.alignItems = 'center';
            style.justifyContent = 'center';

            style2.borderRadius = '50%';
            style2.width = '20px';
            style2.height = '20px';
            style2.backgroundColor = 'blue';
            clickTracker.appendChild(clickTrackerInner);

            this.clickTracker = clickTracker;
            doc.body.appendChild(clickTracker);
        }
    }

    private initUserFriendlyHint(doc: HTMLDocument) {
        const id = 'ubm-hint-div';
        if (!doc.getElementById(id)) {
            const hintDiv = doc.createElement('div');
            hintDiv.setAttribute('id', id);
            const {style} = hintDiv;
            style.position = 'fixed';
            style.zIndex = `${this.options.trackerZIndex! + 2}`;
            style.left = '40px';
            style.bottom = '65px';
            style.color = 'red';
            style.fontSize = '24px';
            style.fontWeight = '700';
            style.display = 'none';
            this.userFriendlyHint = hintDiv;
            doc.body.append(hintDiv);
        }
    }

    /**
     * very important!
     * we are deliberately declaring <!DOCTYPE html> in iframe and assigning value to iframe.src
     * so that browser enters html5 normal mode
     * otherwise, the browser enters quirk mode which may make some of the UI looks weird
     * @private
     */
    private async makeIframeHtml5Compatible() {
        const codeSnippet = '<!DOCTYPE html><html><head><body></body></head></html>';
        const blob = new Blob([codeSnippet], {type: 'text/html'});
        const url = URL.createObjectURL(blob);
        this.options.mountPoint.src = url;
        URL.revokeObjectURL(url);
    }

    private async showFirstScene() {
        return new Promise<void>((resolve) => {
            this.makeIframeHtml5Compatible();
            this.options.mountPoint.onload = () => {
                const doc = this.options.mountPoint.contentDocument;
                if (!doc) {
                    throw new Error('cannot find document on mountPoint');
                }
                this.rehydrate(doc, this.ubmPageResult);
                this.initMouseTracker(doc);
                this.initClickTracker(doc);
                this.initUserFriendlyHint(doc);
                this.options.onIframeDocumentObjectCreated
                && this.options.onIframeDocumentObjectCreated(this.options.mountPoint.contentDocument!);
                (async () => {
                    const isFullyRecorded = this.ubmPageResult.recordItems[this.ubmPageResult.recordItems.length - 1][ATTR_MAP.CLASS] === CLASS_TYPE.END;
                    await this.showHintMsg(`Get ready to play session(Fully recorded:${isFullyRecorded})`);
                    resolve();
                })();
            }
        });
    }

    private async showHintMsg(msg: string) {
        clearTimeout(this.timerIdForHint);
        if (this.userFriendlyHint) {
            this.userFriendlyHint.innerHTML = msg;
            this.userFriendlyHint.style.display = 'block';
            return new Promise<void>((resolve) => {
                // @ts-ignore
                this.timerIdForHint = setTimeout(() => {
                    this.userFriendlyHint.style.display = 'none';
                    resolve();
                }, 2000);
            });
        } else {
            console.log(msg);
        }
    }

    private async playRecord(record: RecordItem) {
        if (UserBehaviorPlayer.isTextRecordItem(record)) {
            const parent = this.ensureElement(record[ATTR_MAP.PID], 'parent', record) as Element;
            if (parent) {
                const text = [...parent.childNodes].find((c) => c.constructor.name === 'Text');
                // replace the first child here, normally there won't be more than 1 text child
                // if the MutationRecord.type===characterData happens
                if (text) {
                    (text as Text).data = record.d;
                } else {
                    const parentHasNonTextChild = parent.childElementCount > 0;
                    if (!parentHasNonTextChild) {
                        parent.innerHTML = record.d;
                    } else {
                        console.warn(`Failed to insert data record ${JSON.stringify(record, null, 2)}, take a look at `
                            + 'you code because this might not be a good practice to mix text and code');
                    }
                }
            }
        } else if (UserBehaviorPlayer.isAttributeRecordItem(record)) {
            const ele = this.ensureElement(record[ATTR_MAP.TID]!, 'normal', record) as Element;
            let {v} = record;
            if (ele) {
                // carry on the old class attribute
                if (record[ATTR_MAP.KEY] === 'class') {
                    const allClassed = [...ele.classList.values()];
                    const ubmClass = allClassed.find((a) => UMB_CLASS_REGEX.test(a));
                    if (ubmClass && v.indexOf(ubmClass) === -1) {
                        v += ` ${ubmClass}`;
                    }
                }
                if (v) {
                    this.setAttribute(ele, record[ATTR_MAP.KEY], v);
                } else {
                    ele.removeAttribute(record[ATTR_MAP.KEY]);
                }
            }
        } else if (UserBehaviorPlayer.isNewNodeRecordItem(record)) {
            const parent = this.ensureElement(record[ATTR_MAP.PID], 'parent', record);
            if (parent) {
                const newNodeRoot = this.rehydrateNode(record[ATTR_MAP.NEW_SNAPSHOT_NODE], record[ATTR_MAP.PID]);
                if (record.pr) {
                    const prevSibling = this.getDomNode(record.pr);
                    if (!prevSibling) {
                        console.warn('Cannot find prev sibling for,fallback to appendChild',
                            JSON.stringify(record, null, 2));
                        parent.appendChild(newNodeRoot);
                    } else {
                        insertAfter(newNodeRoot, prevSibling);
                    }
                } else if (record.ne) {
                    const nextSibling = this.getDomNode(record.ne);
                    if (!nextSibling) {
                        console.warn(`Cannot find next sibling for ${JSON.stringify(record, null, 2)}, fallback to
                        insert as the first child, need investigation`);
                        insertAsFirst(newNodeRoot, parent);
                    } else {
                        parent.insertBefore(newNodeRoot, nextSibling);
                    }
                } else {
                    parent.appendChild(newNodeRoot);
                }
            }
        } else if (UserBehaviorPlayer.isDeleteNodeRecordItem(record)) {
            if (record[ATTR_MAP.DELETED_DATA]) {
                const parent = this.ensureElement(record[ATTR_MAP.PID], 'parent', record);
                if (parent) {
                    // @ts-ignore
                    const textNode = [...parent.childNodes].find((n) => n.constructor?.name === 'Text' && n.data === record[ATTR_MAP.DELETED_DATA]);
                    if (!textNode) {
                        console.warn(`cannot find text node in parent for record:\n, and content is ${record[ATTR_MAP.DELETED_DATA]}`);
                    } else {
                        parent.removeChild(textNode);
                    }
                }
            } else {
                const node = this.ensureElement(record[ATTR_MAP.TID]!, 'normal', record, true);
                if (node) {
                    const parent = node.parentElement!;
                    parent.removeChild(node);
                }
            }
            this.deletedId.add(record[ATTR_MAP.TID]!);
        } else if (UserBehaviorPlayer.isScrollRecordItem(record)) {
            if (this.isSeeking) {
                return;
            }
            const domNode = this.ensureElement(record[ATTR_MAP.TID]!, 'normal', record) as Element;
            if (domNode) {
                // if (domNode.constructor.name === 'HTMLHtmlElement') {
                //     const body = [...domNode.childNodes].find(n => n.constructor.name === 'HTMLBodyElement');
                //     if (body) {
                //         (body as any).scrollTo(record[ATTR_MAP.LEFT], record[ATTR_MAP.TOP]);
                //     }
                // } else {
                //     domNode.scrollTo(record[ATTR_MAP.LEFT], record[ATTR_MAP.TOP]);
                // }
                domNode.scrollTo(record[ATTR_MAP.LEFT], record[ATTR_MAP.TOP]);

            }
        } else if (UserBehaviorPlayer.isMousePositionItem(record)) {
            if (this.isSeeking) {
                return;
            }
            this.mouseTracker.style.left = `${record[ATTR_MAP.LEFT]}px`;
            this.mouseTracker.style.top = `${record[ATTR_MAP.TOP]}px`;
        } else if (UserBehaviorPlayer.isClickRecordItem(record)) {
            if (this.isSeeking) {
                return;
            }
            clearTimeout(this.timerIdForClick);
            this.clickTracker.style.display = 'flex';
            this.mouseTracker.style.display = 'none';
            this.clickTracker.style.left = `${record[ATTR_MAP.LEFT]}px`;
            this.clickTracker.style.top = `${record[ATTR_MAP.TOP]}px`;
            // @ts-ignore
            this.timerIdForClick = setTimeout(() => {
                this.mouseTracker.style.display = 'block';
                this.clickTracker.style.display = 'none';
            }, 200);
        } else if (UserBehaviorPlayer.isHighlightRecordItem(record)) {
            if (this.isSeeking) {
                return;
            }
            if (record[ATTR_MAP.HIGHLIGHT_SEMANTIC] === NormalSemantics.URL) {
                await this.showHintMsg("Url changed to " + record[ATTR_MAP.HIGHLIGHT_DESCRIPTION]);
            }
        } else {
            throw new Error("Replay logic not implemented for record " + JSON.stringify(record));
        }
    }

    public pause() {
        runInAction(() => {
            this._isPaused = true;
        });
        clearTimeout(this.timeout);
    }

    public async interruptSeeking() {
        await this.turnOffSeeking('interrupted');
    }

    public async resume() {
        runInAction(() => {
            this._isPaused = false;
        });
        await this.doPlay();
    }

    public async play() {
        this.restoreState();
        await this.playFrom0();
    }

    private async playFrom0() {
        runInAction(() => {
            this._isPlaying = true;
        });
        await this.showFirstScene();
        this.tasks = this.records.slice();
        runInAction(() => {
            this._isPlayingRecords = true;
        });
        await this.doPlay();
    }

    stop() {
        this.restoreState();
        const doc = this.options.mountPoint.contentDocument;
        if (doc) {
            const currentHTMLElement = UserBehaviorPlayer.getHTMLNode(doc);
            // show original blank page
            if (!!this.originalHTMLNode && currentHTMLElement !== this.originalHTMLNode) {
                doc.replaceChild(this.originalHTMLNode, currentHTMLElement);
            }
        }
    }

    // seeking related
    private turnOnSeeking(index: number) {
        runInAction(() => {
            this.seekingTargetIndex = index;
        });
    }

    private async turnOffSeeking(reason: "error" | "finished" | "interrupted") {
        runInAction(() => {
            this.seekingTargetIndex = -1;
        });
        this.pause();
        this.options.onSeekingFinished && this.options.onSeekingFinished();
        const wording = reason === 'error' ? 'Seeking error' : `Seeking ${reason}, press Resume`;
        await this.showHintMsg(wording);
    }

    async rewind(index: number) {
        if (!(index <= this.ubmPageResult.recordItems.length && index >= 0)) {
            await this.turnOffSeeking('error');
            throw new Error(`Invalid seek index: ${index}, total is ${this.ubmPageResult.recordItems.length}`);
        }
        // if rewind index is less than current progress, replay from start
        if (index < this.currentPlayIndex || this.currentPlayIndex === 0) {
            this.stop();
            this.turnOnSeeking(index);
            await this.playFrom0();
        } else if (index > this.currentPlayIndex) {
            this.turnOnSeeking(index);
            if (this.isPaused) {
                await this.resume();
            }
        }
    }

    async rewindPercent(percent: number) {
        const index = Math.floor(this.ubmPageResult.recordItems.length * percent);
        await this.rewind(index);
    }

    private async doPlay() {
        let isNewLoop = true;
        let latestTaskTimeStamp = 0;
        let batchSize = 0;
        if (this._isPaused) {
            return;
        }
        // eslint-disable-next-line no-mixed-operators
        this.options.onProgress && this.options.onProgress(this.progress);

        while (this.tasks.length > 0) {
            batchSize++;
            const nextFirstTask = this.tasks[0];

            // play contiguous records in one event loop to make replay smoother
            const distance = nextFirstTask[ATTR_MAP.TS] - latestTaskTimeStamp;

            // but if the next task is a scroll, interrupt the current event loop
            // and enter into the next one
            const isNextFirstTaskScroll = nextFirstTask[ATTR_MAP.CLASS] === CLASS_TYPE.SCROLL;
            if (isNewLoop
                // we deem any operations within 10ms as consecutive ones
                || (!isNewLoop && distance < 10 && !isNextFirstTaskScroll)
            ) {
                isNewLoop = false;
                const nextTask = this.tasks.shift()!;
                try {
                    if (nextTask[ATTR_MAP.RID] - this.lastRecordId !== 1) {
                        const errMsg = `Record sequence id is not consistent,abort playing, error recordId is ${nextFirstTask[ATTR_MAP.RID]}, lastId is ${this.lastRecordId}`;
                        // eslint-disable-next-line no-await-in-loop
                        await this.showHintMsg(errMsg);
                        console.error(errMsg);
                        this.stop();
                        return;
                    }
                    this.lastRecordId = nextTask[ATTR_MAP.RID];
                    await this.playRecord(nextTask);
                    runInAction(() => {
                        this.currentPlayIndex++;
                    });

                    if (this.isSeekingModeOn) {
                        // exit seeking mode
                        if (this.seekingTargetIndex <= this.currentPlayIndex) {
                            this.options.onProgress && this.options.onProgress(this.progress)
                            await this.turnOffSeeking('finished');
                            // break playing logic
                            break;
                        }
                    }
                } catch (e: any) {
                    console.error('Failed to play task', nextTask, e.message);
                }
                latestTaskTimeStamp = nextTask[ATTR_MAP.TS];
            } else {
                break;
            }
        }
        // if (this.options.debugMode) {
        //     console.debug(`last batch size ${batchSize}`);
        // }
        if (this.tasks.length === 0) {
            this.pause();
            runInAction(() => {
                this._isPlaying = false;
            });
            this.options.onProgress && this.options.onProgress(100);
            this.options.onPlayFinished && this.options.onPlayFinished();
            await this.showHintMsg('Finished playing');
        } else if (this.isSeekingModeOn) {
            // @ts-ignore
            this.timeout = setTimeout(this.doPlay.bind(this), 0);
        } else {
            const nextTask = this.tasks[0];
            const gap = nextTask[ATTR_MAP.TS] - latestTaskTimeStamp;
            const threshold = this.fastForwardThreshold;
            if (gap > threshold) {
                await this.showHintMsg(`User paused here for ${gap} ms, fast forward`);
            }
            const finalGap = Math.min(gap, threshold) / this.speed;
            // @ts-ignore
            this.timeout = setTimeout(this.doPlay.bind(this), finalGap);
        }
    }

    private static getHTMLNode(doc: HTMLDocument) {
        return Array.prototype.slice.call(doc.childNodes)
            .find((n) => n.constructor?.name === 'HTMLHtmlElement');
    }

    private originalHTMLNode!: HTMLElement;

    private rehydrate(doc: HTMLDocument, result: UBMPageResult) {
        const {
            root,
            recordItems,
        } = result;
        this.records = recordItems;
        if (!root || !recordItems) {
            throw new Error('Record data is empty');
        }
        const rootDom = this.rehydrateNode(root, UserBehaviorPlayer.ROOT_PARENT_ID);
        const newHtmlNode = Array.prototype.slice.call(rootDom.childNodes)
            .find((n) => n.constructor?.name === 'HTMLHtmlElement');
        const oldHtmlNode = UserBehaviorPlayer.getHTMLNode(doc);
        doc.replaceChild(newHtmlNode, oldHtmlNode);
        if (!this.originalHTMLNode) {
            this.originalHTMLNode = oldHtmlNode;
        }
    }

    private handleResource(val: string): string {
        // TODO, extract url into a global value so that the process here does not repeat
        const url = new URL(this.ubmPageResult.location);
        if (val.indexOf('blob:') === 0 || val.indexOf('data:') === 0) {
            return val;
        }
        if (val.indexOf('//') === 0) {
            return url.protocol + val;
        } else if (val[0] === '/') {
            return url.origin + val;
        } else if (val.indexOf('http') !== 0) {
            return url.protocol + "//" + val;
        }
        return val;
    }

    private static CSS_URL_PATTERN = /url\((['"])?([^'"]+)(['"])?\)/;

    private setAttribute(domNode: Element, key: string, value: string) {
        if (!value) {
            return value;
        }
        let matchResult;
        if (key === 'src' || key === 'href') {
            value = this.handleResource(value);
        } else if ((matchResult = value.match(UserBehaviorPlayer.CSS_URL_PATTERN)) !== null) {
            // TODO use standard way to replace the logic here
            value = `${RegExp.leftContext}url(${matchResult[1] || ''}${this.handleResource(matchResult[2])}${matchResult[3] || ''})${RegExp.rightContext}`;
        }
        domNode.setAttribute(key, value);
    }

    private rehydrateNode(node: SnapshotNode, parentId: number) {
        const doc = this.options.mountPoint.contentDocument!;
        this.parentRef.set(node[SNAPSHOT_ATTR_MAP.ID], parentId);

        if (node.t === 'TEXT') {
            const domNode = doc.createTextNode(node.d!);
            this.idToDomNode.set(node[SNAPSHOT_ATTR_MAP.ID], domNode);
            return domNode;
        } else {
            try {
                const domNode = node.v
                    ? doc.createElementNS(SVG_NAMESPACE, node.t)
                    : doc.createElement(node.t);
                const attrs = node.a;
                if (attrs) {
                    Object.keys(attrs)
                        .forEach((key) => {
                            this.setAttribute(domNode, key, attrs[key]);
                        });
                }
                const className = UBM_CLASS_PREFIX + node[SNAPSHOT_ATTR_MAP.ID];
                if (!domNode.classList.contains(className)) {
                    domNode.classList.add(className);
                }
                const children = node[SNAPSHOT_ATTR_MAP.CHILDREN];
                if (children && children.length) {
                    children.forEach((c) => {
                        domNode.appendChild(this.rehydrateNode(c, node[SNAPSHOT_ATTR_MAP.ID]));
                    });
                }
                this.idToDomNode.set(node[SNAPSHOT_ATTR_MAP.ID], domNode);
                return domNode;
            } catch (e: any) {
                throw new Error(`Not supported node type: ${JSON.stringify(node, null, 2)}\n,error: ${e.message}`);
            }
        }
    }
}
