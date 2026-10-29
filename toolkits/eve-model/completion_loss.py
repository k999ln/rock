"""Assistant-only loss with an exclusive real-token upper bound.

The MLX array kernel is compiled by the trainer. Validate every dataset row and
actual batch outside that compiled kernel, before any optimizer update.
"""
LOSS_ID='eve.assistant-only-exclusive-end/1'

def supervised_target_indices(offset,length,target_width):
    if any(type(x) is not int for x in [offset,length,target_width]) or not 1<=offset<length or target_width<1 or length>target_width+1:
        raise ValueError('invalid/empty completion supervision or truncated batch')
    return range(offset,length)

def validate_batch_lengths(lengths,target_width):
    if not lengths:raise ValueError('empty completion batch')
    for row in lengths:
        if not isinstance(row,(list,tuple)) or len(row)!=2:raise ValueError('invalid completion length metadata')
        supervised_target_indices(row[0],row[1],target_width)

def validate_chat_row(tokenizer,row,max_sequence):
    messages=row.get('messages')
    if not isinstance(messages,list) or not messages or messages[-1].get('role')!='assistant' or not isinstance(messages[-1].get('content'),str) or not messages[-1]['content'].strip():
        raise ValueError('nonempty final assistant target required')
    tools=row.get('tools')
    tokens=tokenizer.apply_chat_template(messages,tools=tools,return_dict=False)
    prefix=tokenizer.apply_chat_template(messages[:-1],tools=tools,add_generation_prompt=True,return_dict=False)
    if len(tokens)>max_sequence:raise ValueError('oversized example; no truncation')
    if tokens[:len(prefix)]!=prefix:raise ValueError('assistant prefix tokenization mismatch')
    supervised_target_indices(len(prefix),len(tokens),len(tokens)-1)
    return tokens,len(prefix)

def checked_batches(*args,_iterator=None,**kwargs):
    if _iterator is None:
        from mlx_lm.tuner.trainer import iterate_batches
        _iterator=iterate_batches
    for batch,lengths in _iterator(*args,**kwargs):
        # This occurs outside mx.compile, before optimizer.step/evaluation.
        validate_batch_lengths(lengths.tolist(),batch.shape[1]-1)
        yield batch,lengths

def assistant_only_loss(model,batch,lengths):
    import mlx.core as mx
    import mlx.nn as nn
    if len(batch.shape)!=2 or batch.shape[0]<1 or batch.shape[1]<2 or lengths.shape!=(batch.shape[0],2):
        raise ValueError('invalid completion batch shape')
    inputs=batch[:,:-1];targets=batch[:,1:]
    logits=model(inputs)
    steps=mx.arange(1,targets.shape[1]+1)
    mask=mx.logical_and(steps>=lengths[:,0:1],steps<lengths[:,1:])
    token_losses=nn.losses.cross_entropy(logits,targets)
    count=mask.sum()
    return (token_losses*mask).astype(mx.float32).sum()/count,count
