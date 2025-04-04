import React, { useState } from "react";
import style from "./page1.module.scss";
import { recorder } from "./common";
import SimpleTable from "./SimpleTable";
import { Tooltip } from "antd";
import SimpleForm from "./SimpleForm";

export function Page1() {
    const [input, setInput] = useState('');
    const [records, setRecords] = useState<{ value: string; red?: boolean }[]>([]);

    return (
        <div>
            <div style={{ marginBottom: 10 }}>
                <input
                    value={input}
                    onChange={(e) => {
                        setInput(e.target.value);
                    }}
                />
                <Tooltip title="add a new row">
                    <button
                        className='submit'
                        style={{ marginLeft: 10, marginRight: 10 }}
                        onClick={() => {
                            recorder.addCustomRecordItem({
                                semantic: 'Submit',
                                description: 'User clicks submit',
                            })
                            const v = input.trim();
                            if (v.length > 0) {
                                setRecords((old) => [
                                    ...old,
                                    {
                                        value: v,
                                    },
                                ]);
                            }
                        }}
                    >
                        submit
                    </button>
                </Tooltip>
                <button id='clear' onClick={() => {
                    setRecords([]);
                }}
                >
                    clear all
                </button>
            </div>
            <div>
                {records.length > 0 && (
                    <>
                        {records.map((r, i) => (
                            <div key={i} className={style.color}>
                                <span className={`${style.color} ${r.red ? style.red : ''}`}>{r.value}</span>
                                <button onClick={() => {
                                    records.splice(i, 1);
                                    setRecords(records.slice(0));
                                }}
                                >
                                    remove
                                </button>
                                <button onClick={() => {
                                    records[i].red = true;
                                    setRecords(records.slice(0));
                                }}
                                >
                                    Make red
                                </button>
                                <button onClick={() => {
                                    recorder.addCustomRecordItem({
                                        semantic: 'Prolong',
                                        description: 'User clicks prolong btn #' + (i + 1),
                                    })
                                    records[i].value += 'a';
                                    setRecords(records.slice(0));
                                }} className={'prolong'}
                                >
                                    prolong
                                </button>
                            </div>
                        ))}
                    </>
                )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'stretch' }}>
                <div style={{
                    marginTop: 10,
                    marginRight: 50
                }}>
                    <div style={{
                        background: '#59eb12',
                        overflow: 'auto',
                        height: 200,
                        width: 200,
                    }}
                    >
                        <div style={{
                            width: 1000,
                            height: 1000,
                            color: 'white',
                        }}
                        >
                            Test scrolling
                        </div>
                    </div>
                    <SimpleTable />
                </div>


                <SimpleForm />
            </div>
        </div>
    );
}
