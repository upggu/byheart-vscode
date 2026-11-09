import {expect,test} from 'vitest';
import {parseEmphasis} from '../../src/core/lib/emphasis';
test('extracts plain text and UTF-16 ranges without interpreting other markup',()=>{
 expect(parseEmphasis('Hi **😀 world**, *yes*!')).toEqual({text:'Hi 😀 world, yes!',ranges:[{start:3,end:11,kind:'bold'},{start:13,end:16,kind:'italic'}]});
 for(const text of ['***nested***','**unfinished','<img src=x>','**a\nb**','a_b_c'])expect(parseEmphasis(text)).toEqual({text,ranges:[]});
});

test('sentence boundaries clip emphasis without changing sentence IDs',async()=>{
 const {sentenceUnits}=await import('../../src/core/lib/sentences');
 const {passage}=await import('./fixtures');
 const item={...passage,lines:[{id:'line',seq:1,speaker:'',korean:'',english:'First. Second.',emphasis:[{start:0,end:14,kind:'bold' as const}]}]};
 expect(sentenceUnits(item).map(u=>[u.id,u.english,u.emphasis])).toEqual([
  ['line--s1','First.',[{start:0,end:6,kind:'bold'}]],['line--s2','Second.',[{start:0,end:7,kind:'bold'}]],
 ]);
});
