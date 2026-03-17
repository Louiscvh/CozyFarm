import { readFile } from "node:fs/promises"
import ts from "typescript"

const EXTENSIONS = [".ts", ".tsx", ".js", ".mjs"]

export async function resolve(specifier, context, defaultResolve) {
  try {
    return await defaultResolve(specifier, context, defaultResolve)
  } catch (error) {
    const isRelative = specifier.startsWith("./") || specifier.startsWith("../")
    const hasExtension = /\.[a-zA-Z0-9]+$/.test(specifier)
    if (!isRelative || hasExtension) throw error

    for (const ext of EXTENSIONS) {
      try {
        return await defaultResolve(`${specifier}${ext}`, context, defaultResolve)
      } catch {
        // try next extension
      }
    }

    throw error
  }
}

export async function load(url, context, defaultLoad) {
  if (url.endsWith(".ts") || url.endsWith(".tsx")) {
    const source = await readFile(new URL(url), "utf8")
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
      fileName: url,
    })

    return {
      format: "module",
      source: transpiled.outputText,
      shortCircuit: true,
    }
  }

  return defaultLoad(url, context, defaultLoad)
}
