import * as React from 'react';
import ReactDom from "react-dom";
import {BrowserRouter} from "react-router-dom";
import {RecordTestEntry} from "./entry";

export function RecorderTest() {
    return (
        <BrowserRouter basename={'/recorder.html'}>
            <RecordTestEntry/>
        </BrowserRouter>
    )
}

ReactDom.render(
    <RecorderTest/>
    , document.getElementById('root'));
