import type { ComponentProps, PropsWithChildren } from 'react'
import type { RecipeVariantProps } from 'styled-system/css/index.mjs'
import { Button } from '@tarojs/components'
import { cva, cx } from 'styled-system/css/index.mjs'
import { styled } from 'styled-system/jsx/index.mjs'

const styleButton = cva({
  base: {
    // Taro H5 injects unlayered native button defaults. Override only the
    // properties the recipe owns; Panda's layers remain native on the Web.
    display: 'flex !important',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '0 !important',
  },
  variants: {
    visual: {
      solid: { bg: 'red.200 !important', color: 'white !important' },
      outline: { bg: 'transparent !important', borderWidth: '1px !important', borderColor: 'red.200' },
    },
    size: {
      sm: { padding: '1 !important', fontSize: '20px !important' },
      lg: { padding: '2 !important', fontSize: '24px !important' },
    },
  },
  defaultVariants: {
    size: 'sm',
    visual: 'solid',
  },
})

const StyledButton = styled(Button)

export type IceButtonProps = PropsWithChildren<
  {
    className?: string
  } & Pick<ComponentProps<typeof Button>, 'id' | 'onClick'> & RecipeVariantProps<typeof styleButton>
>

export default function IceButton(props: IceButtonProps) {
  return (
    <StyledButton
      id={props.id}
      onClick={props.onClick}
      className={cx(
        styleButton({
          size: props.size,
          visual: props.visual,
        }),
        props.className,
      )}
    >
      {props.children}
    </StyledButton>
  )
}
