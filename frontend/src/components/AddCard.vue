<template>

    <v-dialog max-width="500">

    
    <template v-slot:activator="{ props: activatorProps }">

        <v-btn 
        variant="default" 
        style="background-color: #85144B;" 
        prepend-icon="mdi-plus" 
        color="#ffffff"
        v-bind="activatorProps">
            Add a card
        </v-btn>

    </template>

    <template v-slot:default="{ isActive }">
        <v-card title="Dialog">
        <v-card-text>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
        </v-card-text>

        <v-card-actions>
            <v-spacer></v-spacer>
            <v-text-field
                v-model="search"
                label="Search"
                prepend-inner-icon="mdi-magnify"
                variant="outlined"
                hide-details
                single-line
            ></v-text-field>
        </v-card-actions>
        </v-card>
    </template>
    </v-dialog>


</template>