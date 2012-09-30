Conway's Game of Life implemented in Python using pygame

Takes two arguments, used as width and height of board.
	e.g. "python gameoflife.py 25 25" starts game with 25x25 board	
	STAY UNDER 35x35 FOR DECENT PERFORMANCE

Setup:
	Given an empty board with user-specified dimensions (x, y)
	Fill board with initial random pattern of filled/empty cells

Rules:
	If an empty cell has 3 neighbors, fill it on next turn
	If a filled cell has 1 or 0 neighbors, empty on next turn (dies of loneliness)
	If an occupied cell has 4 or more neighbors, empty on next turn (dies of overcrowding)