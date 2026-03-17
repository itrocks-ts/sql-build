
export enum JoinMode {
	INNER = 'INNER',
	LEFT  = 'LEFT',
	OUTER = 'OUTER',
	RIGHT = 'RIGHT'
}

export class Join
{

	foreignAlias = ''
	masterAlias  = ''

	constructor(
		public masterTable:  string,
		public masterColumn: string,
		public foreignTable: string,
		public foreignColumn  = 'id',
		public mode: JoinMode = JoinMode.LEFT
	) {
	}

	sql()
	{
		return this.mode + ' JOIN `' + this.foreignTable + '`'
			+ ((this.foreignAlias && (this.foreignAlias !== this.foreignTable)) ? (' AS `' + this.foreignAlias + '`') : '')
			+ ' ON `' + (this.foreignAlias || this.foreignTable) + '`.' + this.foreignColumn
			+ ' = `' + (this.masterAlias || this.masterTable) + '`.' + this.masterColumn
	}

}
