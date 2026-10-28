import React from 'react';
export default function Link({ children, href, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a href={href} {...rest}>{children}</a>;
}
