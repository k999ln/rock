"""Stopped current-copy issuer epoch CAS, joined to actual C/index evidence.

No network endpoint, arbitrary claimed epoch, historical Game DB replacement or
new signing key is an input. Each Game keeps its original independent journal.
"""
from contextlib import closing
from . import protocol as p
from . import current_restore as r
from .connections import encoded,loaded


def handover(grant,runtime,index,coordinator,restore_id,*,expected_before_sha256=None):
    from .exchange_authority import GameGrantAuthority
    p.require(type(grant) is GameGrantAuthority,'actual retained Game authority required')
    record,plan=r._record(index,restore_id)
    p.require(record['state']=='DONE','connection/Wallet current-copy handover must complete first')
    old,new=plan['old_descriptor'],plan['new_descriptor']
    normalized={'wallet_authority_id':new['wallet_authority_id'],'ledger_uuid':new['ledger_uuid'],
        'old_epoch':old['writer_epoch'],'new_epoch':new['writer_epoch']}
    expected={'schema':'rock-game-grant-epoch-receipt/1','restore_id':restore_id,'status':'DONE',
        'game_authority_id':grant.authority.game.game_authority_id,'game_id':grant.authority.game.game_id,
        'game_store_uuid':grant.store.uuid,'index_uuid':index.uuid,'game_plan_sha256':r._digest(plan),
        'c_record_sha256':plan['c_record_sha256'],**normalized,'simulation_only':True}
    # Management lifetime holds the genuine destination permit. No service or
    # scheduler can publish it, and the current source is already retired.
    with runtime._current_game_restore_admission(index,coordinator,restore_id,r._digest(plan)):
        with coordinator.current_restore_generation(restore_id,record_sha256=plan['c_record_sha256']) as proof,index.author_gate:
            p.require(all(plan[k]==v for k,v in r._proof_value(proof).items()),'current C generation differs from retained plan')
            with runtime._service.wallet._transaction() as wallet:
                with index.transaction() as indexed:r._check_snapshots(index,plan,wallet,indexed,remove_current=True)
                r.require_bound_mode(wallet,index,runtime.descriptor)
            with grant.store.transaction() as db:
                row=db.execute('SELECT * FROM grant_issuers WHERE wallet_authority_id=?',(new['wallet_authority_id'],)).fetchone()
                p.require(row and row['ledger_uuid']==new['ledger_uuid'],'original independent Game issuer registration required')
                prior=db.execute('SELECT * FROM grant_epoch_receipts WHERE restore_id=?',(restore_id,)).fetchone()
                state=r.snapshot(db,omit_restore_id=restore_id,normalize_grant_issuer=normalized)
                before=r._digest(state)
                if expected_before_sha256 is not None:
                    p.digest(expected_before_sha256)
                    p.require(before==expected_before_sha256,'retained Game journal differs from exact stopped archive')
                if prior:
                    receipt=loaded(prior['receipt'])
                    p.require(receipt==dict(expected,before_sha256=before) and
                        (prior['wallet_authority_id'],prior['old_epoch'],prior['new_epoch'])==(new['wallet_authority_id'],old['writer_epoch'],new['writer_epoch']) and
                        row['current_epoch']==new['writer_epoch'],'only exact unchanged completed Game epoch may resume')
                    grant.verify(db);return receipt
                p.require(row['current_epoch']==old['writer_epoch'],'Game issuer epoch is not the retained predecessor')
                receipt=dict(expected,before_sha256=before)
                changed=db.execute('UPDATE grant_issuers SET current_epoch=? WHERE wallet_authority_id=? AND ledger_uuid=? AND current_epoch=?',
                    (new['writer_epoch'],new['wallet_authority_id'],new['ledger_uuid'],old['writer_epoch']))
                p.require(changed.rowcount==1,'Game issuer epoch compare-and-swap failed')
                db.execute('INSERT INTO grant_epoch_receipts VALUES (?,?,?,?,?)',
                    (restore_id,new['wallet_authority_id'],old['writer_epoch'],new['writer_epoch'],encoded(receipt)))
                p.require(r._digest(r.snapshot(db,omit_restore_id=restore_id,normalize_grant_issuer=normalized))==before,
                    'original Game rows/schema changed during epoch handover')
                grant.verify(db);return receipt
