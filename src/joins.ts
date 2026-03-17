import { Join } from './join'

export class Joins
{

	joins: Join[] = []

	sql()
	{
		return this.joins.map(join => join.sql()).join(' ')
	}

}
