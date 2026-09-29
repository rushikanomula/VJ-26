export type Box={x:number;y:number;width:number;height:number;label:string;severity:'low'|'moderate'|'high'}
export type Treatment={name:string;instructions:string;precautions:string}
export type Diagnosis={crop:string;diagnosis:string;summary:string;confidence:number;severity:'none'|'low'|'moderate'|'high'|'unknown';boxes:Box[];organic_treatments:Treatment[];chemical_treatments:Treatment[];next_steps:string[];limitations:string[];needs_expert_review:boolean}
