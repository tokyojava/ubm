import Koa from 'koa';
import Router from 'koa-router';
import cors from '@koa/cors';
import path from "path";
import bodyParser from 'koa-bodyparser';

import fs, {
    exists as fsExists,
    mkdir as fsMkdir,
    readdir as fsReaddir,
    readFile as fsReadFile,
    rmdir as fsRmdir,
} from "fs";
import {promisify} from "util";
import {ATTR_MAP, RecordItem} from "../components/interface";

const mkdir = promisify(fsMkdir);
const exists = promisify(fsExists);
const readFile = promisify(fsReadFile);
const readDir = promisify(fsReaddir);
const rmdir = promisify(fsRmdir);

const app = new Koa();
const router = new Router({prefix: '/ubm'});
const chunkDir = path.resolve(__dirname, './chunks/');

async function ensureFolder(sessionId: string, recreateIfExists: boolean) {
    const folderPath = path.resolve(chunkDir, sessionId);
    const isFolderExist = await exists(folderPath);
    if (!isFolderExist) {
        await mkdir(folderPath);
    } else if (recreateIfExists) {
        // @ts-ignore
        await rmdir(folderPath, {force: true, recursive: true});
        await mkdir(folderPath);
    }
    return folderPath;
}

async function sleep(m: number) {
    return new Promise(resolve => {
        setTimeout(resolve, m);
    })
}

router.post('/', async (ctx) => {
    const folderPath = await ensureFolder(ctx.request.body.sessionId, true);
    const rootFilePath = path.resolve(folderPath, 'root.json');
    const writeStream = fs.createWriteStream(rootFilePath);
    const write = promisify(writeStream.write.bind(writeStream)) as any;
    await write(JSON.stringify(ctx.request.body));
    writeStream.close();

    ctx.body = {
        code: 0,
        msg: '',
    }
});

router.post('/records', async (ctx) => {
    const {sessionId, records} = ctx.request.body;
    const folderPath = await ensureFolder(sessionId, false);

    if (records.length === 0) {
        ctx.body = {
            code: 0,
            msg: 'no record',
        }
        return;
    }
    const record0 = records[0];
    const fileName = record0[ATTR_MAP.RID] + ".json";
    const recordPath = path.resolve(folderPath, fileName);
    const writeStream = fs.createWriteStream(recordPath);
    const write = promisify(writeStream.write.bind(writeStream)) as any;
    await write(JSON.stringify(records));
    writeStream.close();

    ctx.body = {
        code: 0,
        msg: '',
    }
});

router.get('/:sessionId', async (ctx) => {
    const fileNameRegex = /^\d+\.json$/
    const sessionId = ctx.params.sessionId;
    const lenient = ctx.query.lenient === 'true';
    const folderPath = path.resolve(chunkDir, sessionId);
    const isFolderExist = await exists(folderPath);
    if (!isFolderExist) {
        ctx.body = {
            code: -1,
            msg: 'Cannot find directory for session' + sessionId,
        }
        return;
    } else {
        const files = await readDir(folderPath);
        let rootFileContent: any = undefined;
        let recordFiles: string[] = [];
        for (const file of files) {
            if (file === 'root.json') {
                rootFileContent = JSON.parse((await readFile(path.resolve(folderPath, 'root.json'))).toString());
            } else {
                if (fileNameRegex.test(file)) {
                    recordFiles.push(path.resolve(folderPath, file));
                }
            }
        }
        if (typeof rootFileContent === 'undefined') {
            ctx.body = {
                code: -1,
                msg: 'Cannot find root file for session' + sessionId,
            }
            return;
        }
        recordFiles = recordFiles.sort((f1, f2) => {
            const figure1 = +f1.substring(f1.lastIndexOf('/') + 1, f1.length - 5);
            const figure2 = +f2.substring(f2.lastIndexOf('/') + 1, f2.length - 5);
            return figure1 < figure2 ? -1 : 1;
        });
        const recordFileContents: { fileName: string, buffer: Buffer }[] = await Promise.all<any>(recordFiles.map(f => new Promise(resolve => {
            readFile(f)
                .then(buffer => {
                    resolve({
                        fileName: f,
                        buffer,
                    });
                });
        })));

        const recordItemsJsons: RecordItem[][] = [];
        for (const {fileName, buffer} of recordFileContents) {
            try {
                recordItemsJsons.push(JSON.parse(buffer.toString()));
            } catch (e: any) {
                throw new Error("Failed to parse " + fileName + ",error:" + e.message);
            }
        }

        const recordItems: any = [];

        let lostNumber = 0;
        let previousRoundLastRecord: RecordItem | null = null;
        for (const items of recordItemsJsons) {
            if (previousRoundLastRecord) {
                // non-consecutive record detected
                if (items[0][ATTR_MAP.RID] - previousRoundLastRecord[ATTR_MAP.RID] !== 1) {
                    const lastRecordItemJson = recordItemsJsons[recordItemsJsons.length - 1];
                    const lastRecordId = lastRecordItemJson[lastRecordItemJson.length - 1][ATTR_MAP.RID];
                    lostNumber = lastRecordId - previousRoundLastRecord[ATTR_MAP.RID];
                    if (!lenient) {
                        ctx.body = {
                            code: -1,
                            msg: `Cannot find assemble records for session ${sessionId}, lost ${lostNumber} records, check surrounding files of ${items[0][ATTR_MAP.RID]}.json`,
                        }
                        return;
                    }else{
                        break;
                    }
                }
            }
            previousRoundLastRecord = items[items.length - 1];
            recordItems.push(...items);
        }

        const metaInfo = {
            ...rootFileContent.metaInfo,
        }

        const body = {
            sessionId,
            location: rootFileContent.location,
            root: rootFileContent.root,
            metaInfo,
            recordItems: recordItems,
        }
        ctx.body = {
            code: 0,
            data: body,
            msg: lostNumber > 0 ? 'Lost ' + lostNumber + ' records' : '',
        }
    }
});

app.use(cors());
app.use(bodyParser({
    jsonLimit: '10mb',
}));
app.use(router.routes());
app.listen(3112);
