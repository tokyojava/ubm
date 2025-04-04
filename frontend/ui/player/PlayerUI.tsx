import * as React from 'react';
import cssStyle from './player-ui.module.scss';
import {
    Input, Button, message, Progress, Spin, InputNumber, Slider, Popover, List, Select, Affix,
} from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import UserBehaviorPlayer from '../../core/player';
import { ATTR_MAP, UBMPageResult } from '../../core/interface';
import SettingsModal from './SettingsModal';
import { useLoadingEffect } from "./hook-utils";
import { observer } from "mobx-react";
import { DownCircleOutlined, SearchOutlined } from '@ant-design/icons';
import cls from 'classnames';
import { normalizePercentage } from "../../core/ubm-utils";

const middleStyle = { position: 'fixed', zIndex: 99999, top: '40%', left: '50%', transform: 'translate(-50%)' }
const seekingOperationStyle = { ...middleStyle, display: 'flex', alignItems: 'center' }
const sliderStyle = { width: 400 };
const seekingMaskStyle = { width: '100%', height: '100%', position: 'fixed', backdropFilter: 'blur(5px)' };
const progressSpanStyle = { marginLeft: 16, width: 50 };
const SEMANTIC_ALL = '__all';

export default observer(function PlayerUI() {
    const [sessionId, setSessionId] = useState('');
    const [journeyTime, setJourneyTime] = useState('');
    const [isFetched, setIsFetched] = useState(false);
    const [showSettingModal, setShowSettingModal] = useState(false);
    const [domain, setDomain] = useState('http://localhost:3112');
    const [lenient, setLenient] = useState(false);
    const [progress, setProgress] = useState(0);
    const [collapsed, setCollapsed] = useState(false);

    const [seekTarget, setSeekTarget] = useState(0);

    const playerRef = useRef<UserBehaviorPlayer>(new UserBehaviorPlayer());

    const doFetchData = async (domain: string, sessionId: string) => {
        const result = await fetch(`${domain}/ubm/${sessionId}?lenient=${lenient}`, {
            headers: {
                'content-type': 'application/json',
            },
        });
        const body = await result.json();
        if (body.code === 0) {
            return {
                ubmResult: body.data,
                warning: body.msg,
            };
        } else {
            throw new Error(body.msg);
        }
    };

    const [isFetchingData, fetchData] = useLoadingEffect(doFetchData);

    const keyboardEvent = useCallback((e) => {
        const player = playerRef.current;
        e.preventDefault();
        e.stopPropagation();
        if (player) {
            if (player.isPlayingRecords) {
                if (!player.isSeeking && e.key === ' ') {
                    if (player.isPaused) {
                        player.resume();
                    } else {
                        player.pause();
                    }
                } else if (e.key === '1') {
                    player.setSpeed(1);
                } else if (e.key === '2') {
                    player.setSpeed(2);
                } else if (e.key === '3') {
                    player.setSpeed(3);
                } else if (e.key === '4') {
                    player.setSpeed(4);
                } else if (e.key === '5') {
                    player.setSpeed(5);
                }
            }
        }
        if (e.key === 'c') {
            setCollapsed(collapsed => !collapsed);
        }
    }, []);

    useEffect(() => {
        const params = new URL(location.href);
        const domain = params.searchParams.get("domain") || 'http://localhost:3112';
        const sessionId = params.searchParams.get("sessionId");
        setDomain(domain);
        if (sessionId) {
            setSessionId(sessionId);
            setTimeout(() => {
                load(domain, sessionId);
            }, 20);
        }


        document.addEventListener('keyup', keyboardEvent, true);

        return () => {
            document.removeEventListener('keyup', keyboardEvent, true);
        };
    }, []);

    const load = async (domain: string, sessionId: string) => {
        try {
            const result: { ubmResult: UBMPageResult, warning: string } = await fetchData(domain, sessionId);
            setJourneyTime(new Date(result.ubmResult.metaInfo.baseTimestamp).toString());
            // update highlight related states
            setHighlightSemantic(SEMANTIC_ALL);
            setHighlightSearch('');
            setProgress(0);

            playerRef.current.init(result.ubmResult, {
                mountPoint: document.getElementById('viewport')! as HTMLIFrameElement,
                debugMode: true,
                onProgress(val) {
                    setProgress(val);
                },
                onIframeDocumentObjectCreated(iframeDoc) {
                    iframeDoc.addEventListener('keypress', keyboardEvent, true);
                },
            });
            setIsFetched(true);
            if (!!result.warning) {
                message.info(`Session is loaded with warning, total records ${result.ubmResult.recordItems.length}, ${result.warning}, click Play`);
            } else {
                message.info(`Session is loaded, total records ${result.ubmResult.recordItems.length}, click Play`);
            }
        } catch (e: any) {
            setIsFetched(false);
            message.error(`Failed to fetch:${e.message}`);
        }
    };

    const stop = () => {
        const player = playerRef.current!;
        player.stop();
    };

    const onPlayBtnClicked = async () => {
        const player = playerRef.current!;
        if (!player.isPlaying) {
            try {
                await player.play();
            } catch (e: any) {
                message.error(`Failed to play:${e.message}`);
                stop();
            }
        } else {
            stop();
        }
    };

    const resumeOrPause = async () => {
        const player = playerRef.current!;

        if (!player.isPaused) {
            player.pause();
        } else {
            try {
                await player.resume();
            } catch (e: any) {
                debugger;
                message.error(`Failed to resume:${e.message}`);
                console.error(e);
                stop();
            }
        }
    };

    const closeModal = useCallback(() => {
        setShowSettingModal(false);
    }, []);

    const seek = useCallback((val: number) => {
        setSeekTarget(val);
        playerRef.current?.rewindPercent(val / 100);
    }, []);

    const highlightData = playerRef.current ? playerRef.current.highlightRecords : [];
    const totalRecords = playerRef.current ? playerRef.current.totalRecordCount : 0;

    const [highlightSemantic, setHighlightSemantic] = useState(SEMANTIC_ALL);
    const [highlightSearch, setHighlightSearch] = useState('');

    const filteredHighlightRecords = useMemo(() => {
        return highlightData.filter(r => {
            const contentContains = r[ATTR_MAP.HIGHLIGHT_DESCRIPTION].toLowerCase().trim()
                .indexOf(highlightSearch.toLowerCase().trim()) !== -1;
            return highlightSemantic === '__all' ? contentContains :
                contentContains && r[ATTR_MAP.HIGHLIGHT_SEMANTIC] === highlightSemantic;
        });
    }, [highlightSemantic, highlightSearch, highlightData]);

    const [container, setContainer] = useState<HTMLDivElement | null>(null);

    const highlightContents = (
        <div ref={setContainer} style={{ width: 400, height: 350, overflow: 'auto' }}>
            <Affix target={() => container}>
                <div style={{ display: 'flex', margin: 8, justifyContent: 'space-between', alignItems: 'center' }}>
                    <Select style={{ width: 200, marginRight: 8 }} value={highlightSemantic}
                        onChange={setHighlightSemantic}>
                        <Select.Option key={'all'} value={'__all'}>
                            All
                        </Select.Option>
                        {(playerRef.current?.highlightSemantics || []).map(semantic => (
                            <Select.Option key={semantic} value={semantic}>
                                {semantic}
                            </Select.Option>
                        ))}
                    </Select>
                    <Input prefix={<SearchOutlined />} value={highlightSearch} onChange={(e) => {
                        setHighlightSearch(e.target.value);
                    }} />
                </div>
            </Affix>
            <List
                className={cssStyle.highlightList}
                dataSource={filteredHighlightRecords}
                renderItem={item => {
                    const percent = normalizePercentage(item[ATTR_MAP.RID], totalRecords);
                    return <List.Item actions={[<a onClick={() => {
                        const rid = Math.max(item[ATTR_MAP.RID] - 5, 0);
                        playerRef.current?.rewind(rid);
                        setSeekTarget(percent);
                    }} key={'seek'}>Seek</a>]}>
                        <List.Item.Meta
                            description={`${item[ATTR_MAP.HIGHLIGHT_SEMANTIC]}: ${item[ATTR_MAP.HIGHLIGHT_DESCRIPTION]} (${percent}%)`}
                        />
                    </List.Item>
                }}
            />
        </div>
    );

    return (
        <div className={cssStyle.player}>
            {/*{journeyTime && <span className={cssStyle.time}>{journeyTime}</span>}*/}
            {showSettingModal
                && <SettingsModal options={{
                    lenient,
                    domain,
                    fastForwardThreshold: playerRef.current?.getFastForwardThreshold() || 1000,
                    speed: playerRef.current?.getSpeed() || 1,
                }}
                    onOk={(options) => {
                        playerRef.current?.setFastForwardThreshold(options.fastForwardThreshold);
                        playerRef.current?.setSpeed(options.speed as any);
                        setDomain(options.domain);
                        setLenient(options.lenient);
                    }}
                    onClose={closeModal} />}
            {isFetchingData && <Spin style={middleStyle as any} size={"large"} tip={'Loading session data'} />}
            {playerRef.current?.isSeeking &&
                <div style={seekingMaskStyle as any}>
                    <div style={seekingOperationStyle as any}>
                        <Spin style={{ marginRight: 8 }} size={"large"} tip={'Seeking, this may take a while...'} />
                        {playerRef.current?.isSeeking && playerRef.current?.isPlayingRecords &&
                            <Button type={'primary'} style={{ marginLeft: 8 }} onClick={() => {
                                playerRef.current?.interruptSeeking();
                            }}>Interrupt</Button>}
                    </div>
                </div>
            }
            <iframe title="player" frameBorder={0} id="viewport" className={cssStyle.viewport} />
            <div className={cls(cssStyle.tool, { [cssStyle.collapsed]: collapsed })}>
                <div className={cssStyle.left}>
                    <span>Session:</span>
                    <Input
                        style={{
                            marginLeft: 8,
                            marginRight: 8,
                        }}
                        placeholder="session id such as 123"
                        value={sessionId}
                        onChange={(e) => setSessionId(e.target.value)}
                    />
                    <Button type="primary" disabled={playerRef.current?.isPlaying}
                        onClick={() => load(domain, sessionId)}>Load</Button>
                </div>
                <div className={cssStyle.right}>
                    {
                        playerRef.current?.totalRecordCount > 0
                        && <Popover content={highlightContents}>
                            <span style={{ marginRight: 16, color: '#549be7', cursor: 'pointer' }}>Highlight events</span>
                        </Popover>
                    }
                    <Slider
                        value={playerRef.current?.isSeeking ? seekTarget : progress}
                        onChange={setProgress}
                        onAfterChange={seek}
                        min={0}
                        max={100}
                        style={sliderStyle}
                        step={0.1}
                    />
                    <span style={progressSpanStyle}>{progress}%</span>
                    <Button style={{ marginLeft: 8, width: 70 }} disabled={!isFetched} onClick={onPlayBtnClicked}
                        type="primary">{playerRef.current?.isPlaying ? 'Stop' : 'Play'}</Button>
                    <Button style={{ marginLeft: 8, width: 80 }}
                        disabled={!isFetched || !playerRef.current.isPlaying || playerRef.current.isSeeking}
                        onClick={resumeOrPause}
                        type="primary">{playerRef.current?.isPaused ? 'Resume' : 'Pause'}</Button>
                    <Button
                        onClick={() => setShowSettingModal(true)}
                        style={{
                            marginLeft: 8,
                            cursor: 'pointer',
                        }}
                    >
                        Settings
                    </Button>
                    <DownCircleOutlined onClick={() => setCollapsed(!collapsed)}
                        className={cls(cssStyle.collapse, { [cssStyle.reverse]: collapsed })} />
                </div>
            </div>
        </div>
    );
}
);
