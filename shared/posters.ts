import type {Film} from './model';
import {ratingMatch} from './ratings.ts';
export function posterChoices(f:Film){return [...new Set([f.poster,...(f.posterAlternatives||[])].filter((p):p is string=>!!p))].filter(p=>{try{const u=new URL(p);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password}catch{return false}}).slice(0,4)}
export function mergePosters(f:Film,other:Film):Film{if(!ratingMatch(f,other))return f;const previous=posterChoices(f),choices=[...new Set([...previous,...posterChoices(other)])].slice(0,4);if(choices.length===previous.length&&choices.every((p,i)=>p===previous[i]))return f;return {...f,poster:f.poster||choices[0],posterAlternatives:choices.filter(p=>p!==(f.poster||choices[0]))}}
