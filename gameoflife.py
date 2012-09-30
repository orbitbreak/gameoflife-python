import pygame, random, sys
from pygame.locals import *

# Global Variables

# Cells colored green, background black
colors = { 0:(0,0,0), 1:(0,255,0) }

# Pixel dimensions of each cell
block_size = (5,5)

# Framerate in ms
framerate = 500

# 20% of cells will be filled at start
percent_filled = 0.2

def main(argv):

	# Use command-line args to set board dimensions
    if len(argv) != 3: 
		sys.exit("\nPlease enter the board dimensions after the scriptname.\
		\ne.g. gameoflife.py x y\n")		
    game_size = (int(argv[1]), int(argv[2]))

    # Start pygame elements
    screen, bg, clock = init(game_size)

    # Set up randomized board
    board = make_random_board(game_size)

    # Begin main loop
    exit = False
    while not exit:

        # Slow things down to match the framerate
        clock.tick(framerate)

        # Update the board
        update_board(board)

        # Draw the board on the background
        draw_board(board, bg)

        # load background to the window, update display to screen
        screen.blit(bg, (0,0))
        pygame.display.flip()

        # Listen for exit game event
        for event in pygame.event.get():
            if event.type == QUIT:
				exit = True


    print "Didja have fun?"


	
def draw_board(board, bg):
    global block_size

    for cell in board:
        rectangle = (cell[0] * block_size[0], cell[1] * block_size[1],
                     block_size[0], block_size[1])
        pygame.draw.rect(bg, colors[board[cell]], rectangle)

# Gets number of neighbors of given cell
def count_neighbors(cell, board):
    neighbors = [ (cell[0] - 1, cell[1]), (cell[0] - 1, cell[1] - 1),
                  (cell[0], cell[1] - 1), (cell[0] + 1, cell[1] - 1),
                  (cell[0] + 1, cell[1]), (cell[0] + 1, cell[1] + 1),
                  (cell[0], cell[1] + 1), (cell[0] - 1,cell[1] + 1) ]

    count = 0
    for neighbor in neighbors:

        # check that neighbor is within bounds of gameboard
        if neighbor in board.keys():

            # count cells scheduled to die as well
            if board[neighbor] in [1, -1]:
				count += 1

    return count
	
# Refresh board based on rules
def update_board(board):

    # Do for each cell
    for cell in board:

        # Count occupied neighbors
        neighbors = count_neighbors(cell, board)

		# If unoccupied AND neighbors = 3, set to fill on next cycle
        if board[cell] == 0 and neighbors == 3:
			board[cell] = 2


		# If filled and neighbors != (2 OR 3), set to empty on next cycle
        elif board[cell] == 1 and not neighbors in [ 2, 3 ]:
			board[cell] = -1

    # Refresh board
    for cell in board:
        if board[cell] == 2:
			board[cell] = 1
        if board[cell] == -1:
			board[cell] = 0

# Initialize pygame elements
def init(game_size):

    global block_size
    pygame.init()
    pygame.display.set_caption("Conway's Game of Life")
	
    # Set screen size
    screen_size = (game_size[0]*block_size[0],
                  game_size[1]*block_size[1])
    screen = pygame.display.set_mode(screen_size)

    # Get background surface from screen
    bg = screen.convert()

    # Get game clock
    clock = pygame.time.Clock()

    return screen, bg, clock

# Make random start
def make_random_board(game_size):

    global percent_filled

    # Game board set up using boolean dictionary
    board = dict()
    for x in range(game_size[0]):
        for y in range(game_size[1]):
            if random.random() < percent_filled:
				board[(x,y)] = 1
            else: board[(x,y)] = 0
    return board			
		
# RUNTIME
if __name__ == "__main__":
	main(sys.argv)
