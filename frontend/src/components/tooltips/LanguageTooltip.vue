<template>
    <v-tooltip :text="language">
        <template v-slot:activator="{ props }">
            <p class="py-1 px-1 bg-blue rounded text-xs h-fit" v-bind="props">{{ this.languages[language] }}</p>
        </template>
    </v-tooltip>
</template>

<script>
    export default {
        props:['language'],
        data(){
            return{
                languages:{
                    English:'EN',
                    French:'FR',
                    German:'DU',
                    Spanish:'SP',
                    Italian:'IT',
                    Portuguese:'PT'
                },
                
            }
        },
        methods:{},
        mounted(){
          
        },
    };
</script>