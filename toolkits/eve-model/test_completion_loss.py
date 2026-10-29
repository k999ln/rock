import math
import types
import unittest
from unittest.mock import patch
from completion_loss import assistant_only_loss,checked_batches,supervised_target_indices,validate_chat_row

class Tensor:
    """Small independent CPU array backend, not an MLX/model substitute result."""
    def __init__(self,data):self.data=data
    @property
    def shape(self):
        def sizes(x):return (len(x),)+sizes(x[0]) if isinstance(x,list) and x else ()
        return sizes(self.data)
    def __getitem__(self,key):
        rows,cols=key;return Tensor([r[cols] for r in self.data[rows]])
    def matrix(self):return [self.data] if self.data and not isinstance(self.data[0],list) else self.data
    def binary(self,other,fn):
        a=self.matrix();b=other.matrix() if isinstance(other,Tensor) else [[other]]
        height=max(len(a),len(b));width=max(len(a[0]),len(b[0]))
        return Tensor([[fn(a[i%len(a)][j%len(a[0])],b[i%len(b)][j%len(b[0])]) for j in range(width)] for i in range(height)])
    def __ge__(self,other):return self.binary(other,lambda a,b:a>=b)
    def __lt__(self,other):return self.binary(other,lambda a,b:a<b)
    def __mul__(self,other):return self.binary(other,lambda a,b:a*b)
    def astype(self,_):return self
    def sum(self):return sum(sum(r) for r in self.matrix())
    def tolist(self):return self.data

def cpu_modules():
    mx=types.ModuleType('mlx.core');mx.float32='float32';mx.arange=lambda a,b:Tensor(list(range(a,b)))
    mx.logical_and=lambda a,b:a.binary(b,lambda x,y:x and y)
    nn=types.ModuleType('mlx.nn')
    def ce(logits,targets):
        out=[]
        for row,expected in zip(logits.data,targets.data):
            losses=[]
            for scores,target in zip(row,expected):
                top=max(scores);losses.append(top+math.log(sum(math.exp(v-top) for v in scores))-scores[target])
            out.append(losses)
        return Tensor(out)
    nn.losses=types.SimpleNamespace(cross_entropy=ce)
    pkg=types.ModuleType('mlx');pkg.__path__=[];pkg.core=mx;pkg.nn=nn
    return {'mlx':pkg,'mlx.core':mx,'mlx.nn':nn}

class Tokenizer:
    headers={'system':3,'user':4,'assistant':5}
    def apply_chat_template(self,messages,tools=None,add_generation_prompt=False,return_dict=False):
        result=[1]
        for msg in messages:result += [self.headers[msg['role']]]+[ord(c)+10 for c in msg['content']]+[2]
        if add_generation_prompt:result.append(5)
        return result

class CompletionLossTests(unittest.TestCase):
    def test_actual_kernel_excludes_padding_and_keeps_first_answer_and_end(self):
        batch=Tensor([[0,0,1,0,0,0]]);lengths=Tensor([[2,4]])
        logits=Tensor([[[0,-100],[0,math.log(3)],[math.log(9),0],[-100,0],[-100,0]]])
        observed=[]
        def model(inputs):observed.append(inputs.data);return logits
        with patch.dict('sys.modules',cpu_modules()):value,count=assistant_only_loss(model,batch,lengths)
        self.assertEqual(count,2);self.assertEqual(observed,[[[0,0,1,0,0]]])
        self.assertAlmostEqual(value,(math.log(4/3)+math.log(10/9))/2)
        self.assertGreater((math.log(4/3)+math.log(10/9)+100)/3,value+30)
    def test_actual_kernel_heterogeneous_lengths_and_at_full_limit(self):
        batch=Tensor([[0,0,1,0,0,0],[0,1,0,1,0,1]]);lengths=Tensor([[2,4],[1,6]])
        logits=Tensor([[[math.log(3),0]]*5 for _ in range(2)])
        with patch.dict('sys.modules',cpu_modules()):value,count=assistant_only_loss(lambda _:logits,batch,lengths)
        # Real labels are first row[1,0] plus complete second row[1,0,1,0,1].
        expected=(4*math.log(4)+3*math.log(4/3))/7
        self.assertEqual(count,7);self.assertAlmostEqual(value,expected)
        self.assertEqual(list(supervised_target_indices(767,768,767)),[767])
    def test_real_zero_token_is_not_removed_by_token_identity(self):
        batch=[9,8,0,2,0,0];chosen=list(supervised_target_indices(2,4,5))
        self.assertEqual([batch[i] for i in chosen],[0,2]);self.assertNotIn(4,chosen)
    def test_multiturn_prompt_and_real_closing_token(self):
        tokenizer=Tokenizer();row={'messages':[{'role':'system','content':'rule'},{'role':'user','content':'old'},{'role':'assistant','content':'previous'},{'role':'user','content':'new'},{'role':'assistant','content':'answer!'}]}
        tokens,offset=validate_chat_row(tokenizer,row,768)
        self.assertEqual(tokens[offset],ord('a')+10);self.assertEqual(tokens[-1],2)
        self.assertEqual(tokens[offset:-1],[ord(c)+10 for c in 'answer!'])
        with self.assertRaisesRegex(ValueError,'oversized'):validate_chat_row(tokenizer,row,len(tokens)-1)
        row['messages'][-1]['content']=' '
        with self.assertRaisesRegex(ValueError,'nonempty'):validate_chat_row(tokenizer,row,768)
    def test_checked_batch_rejects_empty_before_optimizer(self):
        entered=[]
        def source(*_args,**_kwargs):yield Tensor([[1,2,3,0]]),Tensor([[3,3]])
        with self.assertRaisesRegex(ValueError,'empty'):
            for _ in checked_batches(_iterator=source):entered.append('optimizer would run')
        self.assertEqual(entered,[])
        def truncated(*_args,**_kwargs):yield Tensor([[1,2,3]]),Tensor([[1,4]])
        with self.assertRaisesRegex(ValueError,'truncated'):list(checked_batches(_iterator=truncated))
    def test_invalid_kernel_shape_and_metadata(self):
        with patch.dict('sys.modules',cpu_modules()), self.assertRaisesRegex(ValueError,'shape'):
            assistant_only_loss(lambda _:None,Tensor([[1,2]]),Tensor([[1,2],[1,2]]))
        for args in [(0,3,3),(3,3,3),(4,3,3),(1,5,3),(True,3,3)]:
            with self.assertRaises(ValueError):supervised_target_indices(*args)

if __name__=='__main__':unittest.main()
