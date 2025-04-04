export enum SNAPSHOT_ATTR_MAP {
    ID = 'i',
    TAG_NAME = 't',
    TEXT_DATA = 'd',
    IS_SVG = 'v',
    ATTR = 'a',
    CHILDREN = 'c',
}

export enum ATTR_MAP {
    RID = 'r',
    CLASS = 'c',
    KEY = 'k',
    VALUE = 'v',
    TID = 'i',
    PID = 'p',
    TS = 't',
    DATA = 'd',
    DELETED_DATA = 'dd',
    LEFT = 'x',
    TOP = 'y',
    NEW_SNAPSHOT_NODE = 'sn',
    PREV = 'pr',
    NEXT = 'ne',

    // custom record
    HIGHLIGHT_DESCRIPTION = 'cd',
    HIGHLIGHT_SEMANTIC = 'cs',

    // debug info
    DEBUG_ID = 'di',
    DEBUG_CLASS_NAME = 'dc',
    DEBUG_PARENT_ID = 'dp',
    DEBUG_PARENT_CLASSNAME = 'dpc',
}

export interface SnapshotNode {
    [SNAPSHOT_ATTR_MAP.ID]: number;
    [SNAPSHOT_ATTR_MAP.TAG_NAME]: string;// tag name
    [SNAPSHOT_ATTR_MAP.TEXT_DATA]?: string; // Text Data
    [SNAPSHOT_ATTR_MAP.IS_SVG]: boolean; // is svg element, g, polygon,etc?
    [SNAPSHOT_ATTR_MAP.ATTR]: { [key: string]: string } | null; // attributes
    [SNAPSHOT_ATTR_MAP.CHILDREN]: SnapshotNode[]; // children node
}

export interface RecordItem {
    [ATTR_MAP.RID]: number;
    [ATTR_MAP.DEBUG_ID]?: string; // debug info
    [ATTR_MAP.DEBUG_CLASS_NAME]?: string;// debug info
    [ATTR_MAP.DEBUG_PARENT_ID]?: string; // debug info
    [ATTR_MAP.DEBUG_PARENT_CLASSNAME]?: string; // debug info
    [ATTR_MAP.TID]?: number;
    [ATTR_MAP.CLASS]: CLASS_TYPE;
    [ATTR_MAP.TS]: number;
}

export enum CLASS_TYPE {
    DATA = 'd',
    ATTR = 'a',
    NEW = 'n',
    RM = 'r',
    SCROLL = 's',
    MOUSEMOVE = 'm',
    CLICK = 'c',
    END = 'e',
    HIGHLIGHT = 'h',
}

export interface TextDataRecordItem extends RecordItem {
    [ATTR_MAP.CLASS]: CLASS_TYPE.DATA;
    [ATTR_MAP.PID]: number; // text is not a dom node, we have to record its parent node
    [ATTR_MAP.DATA]: string; // text data
}

export interface AttributeRecordItem extends RecordItem {
    [ATTR_MAP.CLASS]: CLASS_TYPE.ATTR;
    [ATTR_MAP.KEY]: string; // key
    [ATTR_MAP.VALUE]: string; // value
}

export interface NewNodeRecordItem extends RecordItem {
    [ATTR_MAP.CLASS]: CLASS_TYPE.NEW;
    [ATTR_MAP.PID]: number; // parent node id, useful for rehydration

    // used to fine tune the insertion order
    [ATTR_MAP.PREV]?: number; // prev element
    [ATTR_MAP.NEXT]?: number; // next element

    [ATTR_MAP.NEW_SNAPSHOT_NODE]: SnapshotNode;


    // transient attributes are not stored
    transientPrevNode: Node | null;
    transientNextNode: Node | null;
}

export interface DeleteNodeRecordItem extends RecordItem {
    [ATTR_MAP.CLASS]: CLASS_TYPE.RM;
    [ATTR_MAP.DELETED_DATA]: string | null; // short for deleted-data, non-null if the deletion is a text
    [ATTR_MAP.PID]: number; // deletion sometimes requires parent node reference
}

export interface PositionInfo {
    [ATTR_MAP.LEFT]: number;
    [ATTR_MAP.TOP]: number;
}

export interface ScrollRecordItem extends RecordItem, PositionInfo {
    [ATTR_MAP.CLASS]: CLASS_TYPE.SCROLL;
}

export interface MouseMoveRecordItem extends RecordItem, PositionInfo {
    [ATTR_MAP.CLASS]: CLASS_TYPE.MOUSEMOVE;
}

export interface ClickRecordItem extends RecordItem, PositionInfo {
    [ATTR_MAP.CLASS]: CLASS_TYPE.CLICK;
}

export interface EndRecordItem extends RecordItem {
    [ATTR_MAP.CLASS]: CLASS_TYPE.END;
}

export enum NormalSemantics {
    URL = 'URL'
}

export interface HighlightRecordItem extends RecordItem {
    [ATTR_MAP.CLASS]: CLASS_TYPE.HIGHLIGHT;
    [ATTR_MAP.HIGHLIGHT_DESCRIPTION]: string;
    [ATTR_MAP.HIGHLIGHT_SEMANTIC]: string;
}

export interface UBMPageResult {
    sessionId: string;
    location: string;
    metaInfo: RootEmitMetaInfo;
    root: SnapshotNode | undefined;
    recordItems: RecordItem[];
}

export interface RootEmitMetaInfo {
    // the timestamp recorded for all events are relative values
    // and this value serves as the base
    baseTimestamp: number;
}

export interface CTAInfo {
    description: string;
    semantic: string;
}

export const UBM_CLASS_PREFIX = '@';
export const UMB_CLASS_REGEX = /@\d+/;
export const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
