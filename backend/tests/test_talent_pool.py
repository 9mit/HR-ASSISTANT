import pytest
from httpx import AsyncClient, ASGITransport
from talentlens.api import app
from talentlens.models import Batch, Candidate, RankingDecision

@pytest.mark.asyncio
async def test_talent_pool_workflow(db_session):
    """Verify moving candidates to pool, fetching pool, and finalizing shortlists."""
    # 1. Setup: Create a batch and some candidates
    batch = Batch(job_title="Software Engineer")
    db_session.add(batch)
    db_session.commit()
    
    c1 = Candidate(batch_id=batch.id, alias="Dev1", score=85.0, decision="review", raw_record={"id": "1", "score": 85.0, "decision": "review"})
    c2 = Candidate(batch_id=batch.id, alias="Dev2", score=75.0, decision="review", raw_record={"id": "2", "score": 75.0, "decision": "review"})
    c3 = Candidate(batch_id=batch.id, alias="Dev3", score=65.0, decision="review", raw_record={"id": "3", "score": 65.0, "decision": "review"})
    db_session.add_all([c1, c2, c3])
    db_session.commit()
    
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 2. Test: Move to pool
        response = await client.put(f"/api/candidates/{c1.id}/decision", json={"decision": "under_consideration"})
        assert response.status_code == 200
        assert response.json()["decision"] == "under_consideration"
        
        await client.put(f"/api/candidates/{c2.id}/decision", json={"decision": "under_consideration"})
        
        # 3. Test: Fetch Pool
        response = await client.get("/api/pool/candidates?decision=under_consideration")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["decision"] == "under_consideration"
        
        # 4. Test: Finalize Pool (Shortlist c1, Reject c2)
        response = await client.post("/api/pool/finalize", json={"shortlisted_ids": [str(c1.id)]})
        assert response.status_code == 200
        
    # 5. Verify results
    db_session.refresh(c1)
    db_session.refresh(c2)
    assert c1.decision == "shortlist"
    assert c2.decision == "rejected"
    
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 6. Test: Fetch Rejected Pool for Mass Email
        response = await client.get("/api/pool/candidates?decision=rejected")
        assert response.status_code == 200
        assert len(response.json()) == 1

@pytest.mark.asyncio
async def test_high_volume_pool(db_session):
    """Test handling a large number of candidates in the pool for performance and sorting."""
    batch = Batch(job_title="Load Tester")
    db_session.add(batch)
    db_session.commit()
    
    candidates = []
    for i in range(200):
        c = Candidate(
            batch_id=batch.id, 
            alias=f"Candidate_{i}", 
            score=float(i), 
            decision="under_consideration",
            raw_record={"id": str(i), "score": float(i), "decision": "under_consideration"}
        )
        candidates.append(c)
    db_session.add_all(candidates)
    db_session.commit()
    
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/pool/candidates?decision=under_consideration")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 200
        # Verify score sorting (DESC)
        assert data[0]["score"] == 199.0
        assert data[-1]["score"] == 0.0

@pytest.mark.asyncio
async def test_invalid_candidate_update(db_session):
    """Verify that updating a non-existent candidate returns 404."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.put("/api/candidates/9999/decision", json={"decision": "shortlist"})
        assert response.status_code == 404
