// Copied from ../byheart src/review/model.ts at commit 0ee9eaa78e40d6aded17d1d27913c13ed0492339 (2026-11-08). Do not edit; re-copy and update this line.
import {parseEmphasis} from '../lib/emphasis';
import { z } from 'zod';
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const childName = z.string().min(1).refine(s => !/[\\/\x00-\x1f]/.test(s) && s !== '.' && s !== '..');
const learningSchema = z.object({
 translationKo:z.string(), explanationKo:z.string(), reviewNotes:z.array(z.string()),
 basis:z.array(z.object({id:z.string().min(1),text:z.string(),speaker:z.string()}).strict()).min(1).optional(),
}).strict();
const turnSchema = z.object({ id:z.string().min(1), section:z.string().trim().max(200).regex(/^[^\x00-\x1f\x7f]*$/).transform(s=>s||undefined).optional(), speaker:z.string().trim().max(40).regex(/^[^\x00-\x1f\x7f\[\]:]*$/), text:z.string().refine(s=>!!parseEmphasis(s).text.trim() && !/\n[ \t\r]*\n/.test(parseEmphasis(s).text), '대사 내부의 빈 줄을 제거하세요. 일반 줄바꿈은 사용할 수 있습니다.'), kind:z.enum(['study','explanation']).optional(), startMs:integer.optional(), endMs:integer.optional(), translation:z.string().optional(), explanation:z.string().optional() });
const aliases={translationKo:z.string().optional(),explanationKo:z.string().optional()};
const inputTurnSchema=turnSchema.extend({...aliases,reviewed:z.boolean().optional(),learning:learningSchema.optional()});
const archiveSchema=z.object({turnId:z.string().min(1),text:z.string().optional(),translation:z.string().optional(),explanation:z.string().optional()}).strict();
const inputArchiveSchema=archiveSchema.extend({...aliases,learning:learningSchema.optional()});
export type ReviewTurn = z.infer<typeof turnSchema>;
const documentSchema = z.object({schemaVersion:z.literal(1),applicationId:z.string().optional(),appliedSrtSha256:z.string().regex(/^[a-f0-9]{64}$/).optional(),documentId:z.string().min(1),revision:integer,source:z.object({kind:z.enum(['audio','text']).optional(),basename:childName,srtSuffix:z.enum(['.srt','.diarized.srt']).optional(),srtText:z.string().optional(),srtSha256:z.string().regex(/^[a-f0-9]{64}$/).optional(),audioSize:integer.optional(),audioLastModified:integer.optional()}),turns:z.array(inputTurnSchema).min(1),retiredTurnIds:z.array(z.string().min(1)),retiredLearning:z.array(inputArchiveSchema).optional()});
export type ReviewDocument = Omit<z.infer<typeof documentSchema>,'turns'|'retiredLearning'> & {turns:ReviewTurn[];retiredLearning?:z.infer<typeof archiveSchema>[]};
export type TimedTurn = ReviewTurn & {startMs:number;endMs:number};
export function isTimedTurn<T extends {startMs?:number;endMs?:number}>(t:T):t is T & {startMs:number;endMs:number} {return t.startMs!==undefined&&t.endMs!==undefined;}
export function timedNeighbors(turns:ReviewTurn[],index:number){return {
 previous:turns.slice(0,index).reverse().find(isTimedTurn),
 next:turns.slice(index+1).find(isTimedTurn),
};}
export function validateTurns(turns:ReviewTurn[],durationMs?:number):string[] {
 const errors:string[]=[];let previousEnd=0;
 turns.forEach((t,i)=>{
  const timed=isTimedTurn(t);
  if(!turnSchema.safeParse(t).success || (t.startMs===undefined)!==(t.endMs===undefined) ||
   (timed&&(t.startMs>=t.endMs||t.startMs<previousEnd||(durationMs!==undefined&&t.endMs>durationMs))))
   errors.push(`대사 ${i+1}: 텍스트·화자·시각 또는 중첩/음원 범위를 확인하세요.`);
  if(timed)previousEnd=t.endMs;
 });return errors;
}
export const reconfirmNotice='재확인 필요: 원문·화자·문맥이 변경되었습니다.';
export function hasLearning(t:Pick<ReviewTurn,'translation'|'explanation'>):boolean {return t.translation!==undefined||t.explanation!==undefined;}
export function markLearningForReview(t:Pick<ReviewTurn,'translation'|'explanation'>):void {
 if(hasLearning(t)&&!t.explanation?.startsWith(reconfirmNotice))t.explanation=reconfirmNotice+(t.explanation?'\n'+t.explanation:'');
}
export function parseReviewDocument(value:unknown):ReviewDocument {
 const raw=documentSchema.parse(value);
 if(raw.source.kind==='text'){
  if(['srtText','srtSha256','srtSuffix','audioSize','audioLastModified'].some(k=>raw.source[k as keyof typeof raw.source]!==undefined)||raw.appliedSrtSha256!==undefined||raw.turns.some(t=>t.startMs!==undefined||t.endMs!==undefined))throw Error('텍스트 챕터에는 음원 지문과 시각을 지정할 수 없습니다.');
 }else if(raw.source.srtText===undefined||raw.source.srtSha256===undefined||raw.source.audioSize===undefined||raw.source.audioLastModified===undefined)throw Error('음원 원본 정보 누락');
 const migrate=(t:{translation?:string;explanation?:string;translationKo?:string;explanationKo?:string;learning?:z.infer<typeof learningSchema>})=>{
  const {learning,translationKo,explanationKo,...flat}=t;
  const resolve=(values:(string|undefined)[])=>{const present=values.filter((v):v is string=>v!==undefined);if(present.some(v=>v!==present[0]))throw Error('기존 learning/Ko 필드와 새 번역·해설이 다릅니다. 원본을 보존하고 확인하세요.');return present[0];};
  flat.translation=resolve([flat.translation,translationKo,learning?.translationKo]);
  flat.explanation=resolve([flat.explanation,explanationKo,learning?.explanationKo]);
  if(flat.translation===undefined)delete flat.translation;
  if(flat.explanation===undefined)delete flat.explanation;
  if(!learning)return flat;
  if(learning.reviewNotes.length)flat.explanation += (flat.explanation?'\n':'')+learning.reviewNotes.map(n=>'확인 필요: '+n).join('\n');
  if(!learning.basis||learning.basis.length!==raw.turns.length||learning.basis.some((b,i)=>{const current=raw.turns[i];return b.id!==current.id||b.text!==current.text||b.speaker!==current.speaker;}))markLearningForReview(flat);
  return flat;
 };
 const d:ReviewDocument={...raw,turns:raw.turns.map(t=>turnSchema.parse({...t,...migrate(t)})),
  ...(raw.retiredLearning?{retiredLearning:raw.retiredLearning.map(a=>archiveSchema.parse({turnId:a.turnId,text:a.text??a.learning?.basis?.find(b=>b.id===a.turnId)?.text,...migrate({translation:a.translation,explanation:a.explanation,translationKo:a.translationKo,explanationKo:a.explanationKo,learning:a.learning})}))}:{})};
 const ids=[...d.turns.map(t=>t.id),...d.retiredTurnIds];if(new Set(ids).size!==ids.length)throw Error('중복/폐기 ID');
 const archived=d.retiredLearning??[];if(new Set(archived.map(a=>a.turnId)).size!==archived.length||archived.some(a=>!d.retiredTurnIds.includes(a.turnId)))throw Error('폐기 해설 ID 불일치');
 const errors=validateTurns(d.turns);if(errors.length)throw Error(errors.join('\n'));return d;
}
export function createReviewDocument(source:ReviewDocument['source'], turns:Omit<ReviewTurn,'id'>[], nextId:()=>string):ReviewDocument {return parseReviewDocument({schemaVersion:1,documentId:nextId(),revision:0,source,turns:turns.map(t=>({...t,id:nextId()})),retiredTurnIds:[]});}
export function learningNeedsReview(_document:ReviewDocument, turn:ReviewTurn):boolean {
 return hasLearning(turn)&&(turn.kind==='explanation'?!!turn.explanation?.includes('확인 필요:'):(!turn.translation?.trim()||!turn.explanation?.trim()||turn.explanation.includes('확인 필요:')));
}
