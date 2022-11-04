import * as React from 'react';
import * as Messages from "../messages";
import { Backend } from "../backend";
import { Level, Logs, LogEntry } from "../operations/log_singleton";
import { LogListener } from '../operations/log_listener';

/**
 * log window implementation
 */
export class LogWindow extends React.Component implements LogListener {
    
    state = {
        logs: Logs.instance().getAll()
    };

    update() {
        this.setState({logs: Logs.instance().getAll()});
    }

    /** constructor */
    constructor(props: {} | Readonly<{}>) {
        super(props);
        Logs.instance().registerChangeCallback(this);
    }

    componentWillUnmount(): void {
        Logs.instance().unregisterChangeCallback(this); 
    }

    render() {
        function getOption(level: Level | string) {
            if (level == Logs.instance().getLevel()) {
                return <option value={level} key={level} selected>{level}</option>
            } else {
                return <option value={level} key={level}>{level}</option>
            }
        }

        return ( 
            <div className='full'>
                <select className='simple-button inline' name="loglevels" defaultValue={Logs.instance().getLevel()} id="loglevels" onChange={
                    (item: { target: { value: string; }; }) => {
                        Logs.instance().setLevel(item.target.value as Level);
                    }}> 
                    {getOption('DEBUG')} 
                    {getOption('INFO')} 
                    {getOption('WARNING')} 
                    {getOption('ERROR')} 
                </select>
                <button className='simple-button inline' onClick={() => {
                    Logs.instance().clear();
                }}>&nbsp;Clear Logs&nbsp;</button> 
                <button className='simple-button inline' onClick={async () => Logs.instance().save()}>&nbsp;Save Logs&nbsp;</button> 
                <div className="log-box" id="log-box">
                {
                    Logs.instance().getAll().map((entry, index) => {
                        return <div key={index}>{entry.level.toString() + " (" + entry.time.toLocaleTimeString() + "): " + entry.data}</div>
                    })
                }
                </div>
            </div>
        );
    }
}
