import type {SourceAdapter} from './source-adapter';
import type {PersistencePort} from './library';
import type {Episode,Metrics} from './model';
export interface PlaybackPort {load(episode:Episode,position:number):Promise<void>;stop():void;resumePosition():number;snapshot():Metrics}
export interface PlatformPorts {adapters:Map<string,SourceAdapter>;persistence:PersistencePort;playback:PlaybackPort}
