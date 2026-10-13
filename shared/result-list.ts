import type {Film} from './model';
import {sameFilm} from './policy.ts';
import {mergePosters} from './posters.ts';
// Preserve card positions, lazy-loaded posters and keyboard focus.
export function appendFilms(previous:Film[],next:Film[]):Film[]{const out=[...previous];for(const f of next){const i=out.findIndex(old=>sameFilm(old,f));if(i<0)out.push(f);else out[i]=mergePosters(out[i],f)}return out}
