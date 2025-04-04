import React, {useEffect, useState, useRef} from 'react';
import UserBehaviorRecorder from '../components/recorder';
import {RecordItem} from '../components/interface';
import {Link, Route, Switch} from "react-router-dom";
import {Page1} from "./page1";
import {recorder} from "./common";
import {Page2} from "./page2";

export function RecordTestEntry() {
    const [domain, setDomain] = useState('http://localhost:3112')
    const [sessionId, setSessionId] = useState('123');
    const recorderRef = useRef<UserBehaviorRecorder>();
    const [started, setStarted] = useState(false);
    const [showPlayerHint, setShowPlayerHint] = useState(false);

    useEffect(() => {
        recorder.init({
            bufferSize: 10,
            // maxEmitSize: 2,
            onRootEmitted: async (root, metaInfo) => {
                await fetch(domain + '/ubm', {
                    method: 'post',
                    headers: {
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify({
                        // eslint-disable-next-line no-restricted-globals
                        location: location.href,
                        sessionId,
                        root,
                        metaInfo,
                    }),
                });
            },
            onRecordItemsEmitted: async (items: RecordItem[]) => {
                await fetch(domain + '/ubm/records', {
                    method: 'post',
                    headers: {
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify({
                        sessionId,
                        records: items,
                    }),
                });
            },
            onStopped: async () => {
                await fetch(domain + '/ubm/stop', {
                    method: 'post',
                    headers: {
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify({
                        sessionId,
                    })
                });
            },
            debugMode: false,
        });
        recorderRef.current = recorder;
    }, [domain, sessionId]);

    return (
        <div style={{padding: 15}}>
            <div>
                Server Domain: <input value={domain} onChange={(e) => setDomain(e.target.value)}/>
            </div>
            <div style={{marginTop: 10, marginBottom: 50}}>
                SessionId: <input value={sessionId} onChange={(e) => setSessionId(e.target.value)}/>
                <button
                    disabled={started}
                    onClick={() => {
                        setStarted(true);
                        setShowPlayerHint(false);
                        recorderRef.current?.record();
                    }} style={{marginLeft: 10, marginRight: 10}}
                >
                    start
                </button>
                <button
                    disabled={!started}
                    onClick={() => {
                        recorderRef.current?.stop();
                        setStarted(false);
                        setShowPlayerHint(true);
                    }}
                >
                    Stop
                </button>
            </div>
            <div>
                <Link to='/' style={{marginRight: 8}}>Page1</Link>
                <Link to='/page2'>Page2</Link>
            </div>
            <Switch>
                <Route path={'/'} exact component={Page1}/>
                <Route path={'/page2'} exact component={Page2}/>
            </Switch>

            {started && <div>Recoding session {sessionId}....... press Stop Button to stop recording</div>}
            {showPlayerHint && <div>Replay your record <a target='__blank'
                                                          href={`http://localhost:3111/player.html?sessionId=${sessionId}&domain=${domain}`}>here</a>
            </div>}
        </div>
    )
}
