/*
 * [INPUT]: 共享Field呈现组件与BOAI ErrorToast。
 * [OUTPUT]: 公共布局转发，FieldError继续使用宿主Sonner且不渲染错误DOM。
 * [POS]: Renderer表单适配。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import type * as React from "react"
import { useMemo } from "react"
import { ErrorToast } from "@/components/common/error-feedback"
export * from "@boai/ui/field"

function FieldError({
  className,
  children,
  errors,
  ...props
}: React.ComponentProps<"div"> & {
  errors?: Array<{ message?: string } | undefined>
}) {
  const content = useMemo(() => {
    if (children) {
      return children
    }

    if (!errors?.length) {
      return null
    }

    const uniqueErrors = [
      ...new Map(errors.map((error) => [error?.message, error])).values(),
    ]

    if (uniqueErrors?.length == 1) {
      return uniqueErrors[0]?.message
    }

    return (
      <ul className="ml-4 flex list-disc flex-col gap-1">
        {uniqueErrors.map(
          (error, index) =>
            error?.message && <li key={index}>{error.message}</li>
        )}
      </ul>
    )
  }, [children, errors])

  if (!content) {
    return null
  }

  return <ErrorToast>{content}</ErrorToast>
}

export { FieldError }
