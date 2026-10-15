
export type ProjectionErrorCode = 'invalid-path' | 'multiple-values' | 'unsupported-option' | 'unsupported-selection'

export class ProjectionError extends Error
{

	constructor(readonly code: ProjectionErrorCode, readonly path?: string)
	{
		super(path ? `${code}: ${path}` : code)
		this.name = 'ProjectionError'
	}

}
