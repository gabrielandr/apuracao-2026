import sys
def tlv(b,p):
    t=b[p];p+=1;l=b[p];p+=1
    if l==0x80:
        # indefinite: find children until 00 00
        s=p;q=p
        while b[q:q+2]!=b'\0\0': q=tlv(b,q)[3]
        return t,s,q,q+2
    if l&0x80:
        n=l&0x7f;l=int.from_bytes(b[p:p+n],'big');p+=n
    return t,p,p+l,p+l
def kids(b,s,e):
    out=[]
    while s<e:
        r=tlv(b,s);out.append(r);s=r[3]
    return out
def tree(b,s,e):
    res=[]
    for t,a,z,_ in kids(b,s,e):
        if t&0x20: res.append((t,tree(b,a,z)))
        elif t==4 and z-a>20:
            try: res.append((t,tree(b,a,z)))
            except Exception: res.append((t,b[a:z]))
        else: res.append((t,b[a:z]))
    return res
