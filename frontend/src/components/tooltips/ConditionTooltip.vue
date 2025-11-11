<template>
    <v-tooltip :text="condition">
        <template v-slot:activator="{ props }">
            <p class="py-1 px-1 rounded text-xs h-fit" :class="this.condition_color[condition]" v-bind="props">{{ this.conditions[condition] }}</p>
        </template>
    </v-tooltip>
</template>

<script>
    export default {
        props:['condition'],
        data(){
            return{
                conditions:{
                    "Near Mint":'NM',
                    Mint:'MT',
                    Excellent:'EX',
                    Good:'GD',
                    "Light Played":'LP',
                    Played:'PL',
                    Poor:'PR'
                },
                condition_color:{
                    "Near Mint":'bg-green-lighten-1',
                    Mint:'bg-teal-lighten-1',
                    Excellent:'bg-lime-darken-3',
                    Good:'bg-yellow',
                    "Light Played":'bg-yellow-darken-2',
                    Played:'bg-yellow-darken-4',
                    Poor:'bg-red'
                }
                
            }
        },
        methods:{},
        mounted(){
          
        },
    };
</script>