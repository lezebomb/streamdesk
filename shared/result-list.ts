import type {Film} from './model';
import {sameFilm} from './policy.ts';
// Preserve card positions, lazy-loaded posters and keyboard focus.
export function appendFilms(previous:Film[],next:Film[]):Film[]{const out=[...previous];for(const f of next)if(!out.some(old=>sameFilm(old,f)))out.push(f);return out}
