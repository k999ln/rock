# Native remote execution UI contract — native source and unit tests

This is the implemented native UI boundary. The controller wire contract is
`os/runner/evidence/runner-control-handoff.json`. Power GUI verification passed
on the frozen 1058 OS; native remote guest verification passed on frozen
`rock-os-atm-1244`, with adopted proof and fifteen inspected original frames in
`evidence/target-runner-1253/`. The separate replay limitations are recorded there.
No browser, direct network code or caller URL is added.

## Entry and destination

The existing local editor keeps its local-run action and coordinates. A separate
remote entry below it opens a dedicated page using the same selected Tool/input.
Only signed schema-3 destinations declared by the installed manifest and marked
available by `snapshot.remote.destinations` can be selected. The configured
`cloud` fixture is labeled as an owned VM TLS test connection. `pc_usb` is shown
as unconnected/physical USB NOT_RUN; availability never implies physical pairing.
This implementation permits only `pinned_tls_loopback_fixture` transport;
unknown transports stay unavailable rather than inheriting the TLS claim.

The UI uses the backend's target and endpoint ID without substituting a host,
path, mode or destination. A lost connection cannot fall back to local execution
or another remote endpoint.

## Preparation and explicit sending approval

1. Create a fresh random job key and send only `v`, `op:remote.prepare`, `id`,
   `target`, `text` and `key`. The native input limit stays 4096 UTF-8 bytes.
2. Keep the original input separately from the editable buffer. Display the
   returned preparation as **not sent and not approved**, together with that
   exact input, byte count, Tool/version/hash, target, endpoint ID and transport
   scope. The nested `consent.approved:true` is a proposed agreement object; it
   is never user consent by itself.
3. A separate explicit action sends `remote.submit` with the same job key and the
   unchanged complete consent object. No automatic submission follows prepare.
   Changed input, Tool version/hash or destination needs new preparation and
   new approval. The backend performs the authoritative admission recheck.
4. Local queue acceptance is shown as queued locally. Only authenticated
   `remote.status` data can show actual remote acceptance, execution or output.

Leaving a preview must not send it. A visible discard action uses `remote.cancel`
with the original job key and a separate random `cancel_key`. Prepared records
remaining after navigation/restart stay explicitly unsent in remote history;
they cannot be approved from a missing input preview.

## Identity and result handling

Each unresolved request retains the entire request payload. Matching requires
operation and payload identity, not just the job key: prepare, submit and status
share a job key, and cancellation has its independent `cancel_key`. A status read
must not erase uncertainty about a submit/cancel response. Repeated submission
or cancellation reuses its original identity rather than allocating another job.

Remote history comes from `snapshot.remote.history`, with truncation metadata
shown explicitly. It is separate from local `hub.jobs`; no remote result becomes
a local Tool completion or Wallet sale. Opening a remote result reads
`remote.status` for its full bounded output and executor evidence. The renderer
may show only a labeled 16 KiB/240-line preview, retaining the backend's original
bounded response rather than manufacturing a result.

`prepared`, `queued`, `sending`, `unknown`, `accepted`, `running`, `succeeded`,
`failed`, `cancelled`, `indeterminate` and `rejected` remain distinct states.
Cancellation after `send_claimed` cannot claim to retract already-sent data or
undo terminal success. Any returned service error remains visible. Missing
configuration, worker failure and offline state remain unavailable/error states.

## Required evidence after implementation

Native C tests must cover explicit approval, unchanged consent and request
identity, changed-input invalidation, unavailable destinations, unknown replies,
read-result versus mutation separation and cancellation. Actual guest evidence
must then pair QMP pointer/keyboard input and original framebuffer captures with
read-only local-controller and remote-runner records: no send during preview,
exact approved transfer, actual finite execution/output, correct cancellation
semantics and no Wallet/local-Hub job changes. Owned VM TLS evidence does not
prove physical USB, a production cloud service or physical BlackBerry support.
