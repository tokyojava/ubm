import {
    Modal, InputNumber, Select, Input, Checkbox,
} from 'antd';
import React, {useState} from 'react';
import style from './index.module.scss';

interface SettingOptions {
    lenient: boolean;
    domain: string;
    speed: number;
    fastForwardThreshold: number;
}

export default function SettingsModal(props: {
    options: SettingOptions;
    onClose: () => void;
    onOk: (options: SettingOptions) => void;
}) {
    const {
        onOk,
        onClose,
        options,
    } = props;
    const [fastForwardThreshold, setFastForwardThreshold] = useState(options.fastForwardThreshold);
    const [speed, setSpeed] = useState(options.speed);
    const [domain, setDomain] = useState(options.domain);
    const [lenient, setLenient] = useState(options.lenient);
    const confirm = () => {
        onOk({
            speed,
            fastForwardThreshold,
            domain,
            lenient,
        })
        onClose();
    };

    return (
        <Modal
            visible
            title="Player config"
            onCancel={onClose}
            onOk={confirm}
        >
            <div className={style.item}>
                <span>Server Domain:</span>
                <Input
                    style={{width: 300}}
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                />
            </div>
            <div className={style.item}>
                <span>Fast Forward Threshold:</span>
                <InputNumber
                    style={{width: 300}}
                    min={500}
                    max={100000}
                    value={fastForwardThreshold}
                    onChange={setFastForwardThreshold}
                />
            </div>
            <div className={style.item}>
                <span>Speed:</span>
                <Select
                    style={{width: 200}}
                    value={speed}
                    onChange={(v) => {
                        setSpeed(v!);
                    }}
                >
                    <Select.Option value={1}>1</Select.Option>
                    <Select.Option value={2}>2</Select.Option>
                    <Select.Option value={3}>3</Select.Option>
                    <Select.Option value={3}>4</Select.Option>
                    <Select.Option value={5}>5</Select.Option>
                </Select>
            </div>

            <div className={style.item}>
                <span>Lenient:</span>
                <Checkbox checked={lenient} onClick={(e) => setLenient(l => !l)}/>
            </div>
        </Modal>
    );
}
