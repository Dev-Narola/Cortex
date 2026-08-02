import uuid

from src.retrieval.domain.entities import SearchResult


class ReciprocalRankFusion:
    """
    Combines results from multiple search methods (e.g., vector and keyword)
    using the Reciprocal Rank Fusion (RRF) algorithm.
    
    RRF is used because raw scores from different retrieval methods (cosine 
    similarity vs. BM25/ts_rank) are not directly comparable. RRF works on 
    the relative rank of results instead.
    """

    def __init__(self, k: int = 60):
        """
        Initialize RRF with a smoothing constant k.
        
        Args:
            k: A constant used to mitigate the impact of high-ranking results. 
               Typical default is 60.
        """
        self.k = k

    def fuse(
        self,
        vector_results: list[SearchResult],
        keyword_results: list[SearchResult],
        limit: int = 10,
    ) -> list[SearchResult]:
        """
        Fuses two ranked lists into a single ranked list.
        
        Formula: RRF_score(d) = sum(1 / (k + rank(d, result_set)))
        
        Args:
            vector_results: Results from vector similarity search.
            keyword_results: Results from full-text search.
            limit: Maximum number of fused results to return.
            
        Returns:
            A fused and re-ranked list of SearchResults.
        """
        # Map to store fused scores and merged result data
        # Key is chunk_id
        fused_scores: dict[uuid.UUID, float] = {}
        merged_results: dict[uuid.UUID, SearchResult] = {}

        # Process vector results
        for rank, result in enumerate(vector_results, start=1):
            chunk_id = result.chunk_id
            score = 1.0 / (self.k + rank)
            fused_scores[chunk_id] = fused_scores.get(chunk_id, 0.0) + score
            
            if chunk_id not in merged_results:
                merged_results[chunk_id] = result
            merged_results[chunk_id].vector_score = result.score

        # Process keyword results
        for rank, result in enumerate(keyword_results, start=1):
            chunk_id = result.chunk_id
            score = 1.0 / (self.k + rank)
            fused_scores[chunk_id] = fused_scores.get(chunk_id, 0.0) + score
            
            if chunk_id not in merged_results:
                merged_results[chunk_id] = result
                # Since this was not in vector results, its vector score remains 0.0
            else:
                # Update keyword score for existing result that came from vector search
                merged_results[chunk_id].keyword_score = result.score

        # Build final list
        final_results: list[SearchResult] = []
        for chunk_id, fusion_score in fused_scores.items():
            result = merged_results[chunk_id]
            result.fusion_score = fusion_score
            result.score = fusion_score
            result.source_type = "fusion"
            final_results.append(result)

        # Sort by fusion score descending
        final_results.sort(key=lambda x: x.fusion_score, reverse=True)
        
        return final_results[:limit]
