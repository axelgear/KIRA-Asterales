export interface CreateAllIndicesResponse { success: boolean; results: Record<string, any> }
export interface IndicesListResponse { currentIndices: Record<string,string>; allIndices: string[] } 