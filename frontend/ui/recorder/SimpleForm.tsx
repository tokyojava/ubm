import {
    Button,
    Cascader,
    DatePicker,
    Form,
    Input,
    InputNumber,
    Mentions,
    Segmented,
    Select,
    TreeSelect,
} from 'antd';
import * as React from 'react';

const { RangePicker } = DatePicker;
const { TreeNode } = TreeSelect;

const cascaderOptions = [{
    value: 'zhejiang',
    label: '浙江',
    children: [{
        value: 'hangzhou',
        label: '杭州',
        children: [{
            value: 'xihu',
            label: '西湖',
        }],
    }],
}, {
    value: 'jiangsu',
    label: '江苏',
    children: [{
        value: 'nanjing',
        label: '南京',
        children: [{
            value: 'zhonghuamen',
            label: '中华门',
        }],
    }],
}];


const formItemLayout = {
    labelCol: {
        xs: { span: 24 },
        sm: { span: 6 },
    },
    wrapperCol: {
        xs: { span: 24 },
        sm: { span: 14 },
    },
};

const selectOptions: React.ReactNode[] = [];
for (let i = 10; i < 36; i++) {
    selectOptions.push(<Select.Option key={i.toString(36) + i}>{i.toString(36) + i}</Select.Option>);
}

const App: React.FC = () => {
    const [form] = Form.useForm();
    const variant = Form.useWatch('variant', form);
    return (
        <Form
            {...formItemLayout}
            form={form}
            variant={variant || 'filled'}
            style={{ maxWidth: 600 }}
            initialValues={{ variant: 'filled' }}
        >
            <Form.Item label="Form variant" name="variant">
                <Segmented options={['outlined', 'filled', 'borderless', 'underlined']} />
            </Form.Item>

            <Form.Item label="Input" name="Input" rules={[{ required: true, message: 'Please input!' }]}>
                <Input />
            </Form.Item>

            <Form.Item
                label="Select"
                name="Select"
                rules={[{ required: true, message: 'Please input!' }]}
            >
                <Select>
                    {selectOptions}
                </Select>
            </Form.Item>

            <Form.Item
                label="Cascader"
                name="Cascader"
                rules={[{ required: true, message: 'Please input!' }]}
            >
                <Cascader options={cascaderOptions} />
            </Form.Item>

            <Form.Item
                label="TreeSelect"
                name="TreeSelect"
                rules={[{ required: true, message: 'Please input!' }]}
            >
                <TreeSelect style={{ width: 300 }}
                    dropdownStyle={{ maxHeight: 400, overflow: 'auto' }}
                    placeholder="请选择"
                    allowClear
                    treeDefaultExpandAll
                >
                    <TreeNode value="parent 1" title="parent 1" key="0-1">
                        <TreeNode value="parent 1-0" title="parent 1-0" key="0-1-1">
                            <TreeNode value="leaf1" title="my leaf" key="random" />
                            <TreeNode value="leaf2" title="your leaf" key="random1" />
                        </TreeNode>
                        <TreeNode value="parent 1-1" title="parent 1-1" key="random2">
                            <TreeNode value="sss" title={<b style={{ color: '#08c' }}>sss</b>} key="random3" />
                        </TreeNode>
                    </TreeNode>
                </TreeSelect>
            </Form.Item>

            <Form.Item
                label="DatePicker"
                name="DatePicker"
                rules={[{ required: true, message: 'Please input!' }]}
            >
                <DatePicker />
            </Form.Item>

            <Form.Item
                label="RangePicker"
                name="RangePicker"
                rules={[{ required: true, message: 'Please input!' }]}
            >
                <RangePicker />
            </Form.Item>

            <Form.Item wrapperCol={{ offset: 6, span: 16 }}>
                <Button type="primary" htmlType="submit">
                    Submit
                </Button>
            </Form.Item>
        </Form>
    );
};

export default App;